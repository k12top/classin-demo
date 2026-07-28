import "server-only";

import { createHash } from "node:crypto";
import { classroomModePolicy } from "@/lib/classroom/mode";
import { ensureClassroomRuntime } from "@/lib/classroom/server/runtime";
import type {
  ClassroomRole,
  ClassroomSpaceMemberSnapshot,
  ClassroomSpaceSnapshot,
} from "@/lib/classroom/types";
import { prisma } from "@/lib/db";
import { planLargeClassAssignments } from "@/lib/classroom/space-planner";

export class ClassroomSpaceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ClassroomSpaceError";
  }
}

type SpaceMemberRecord = {
  userId: string;
  displayName: string;
  avatar: string;
  role: string;
  active: boolean;
  microphoneAllowed: boolean;
  cameraAllowed: boolean;
  screenShareAllowed: boolean;
  joinedAt: Date | null;
};

type SpaceRecord = {
  id: string;
  kind: string;
  name: string;
  status: string;
  position: number;
  capacity: number | null;
  members: SpaceMemberRecord[];
};

function breakoutChannelName(courseId: string, position: number): string {
  const courseDigest = createHash("sha256")
    .update(courseId)
    .digest("hex")
    .slice(0, 24);
  return `br-${courseDigest}-${String(position).padStart(2, "0")}`;
}

function publicMember(member: SpaceMemberRecord): ClassroomSpaceMemberSnapshot {
  return {
    userId: member.userId,
    displayName: member.displayName,
    avatar: member.avatar,
    role: member.role === "assistant" ? "assistant" : "student",
    active: member.active,
    microphoneAllowed: member.microphoneAllowed,
    cameraAllowed: member.cameraAllowed,
    screenShareAllowed: member.screenShareAllowed,
    joinedAt: member.joinedAt?.toISOString() ?? null,
  };
}

function publicSpace(
  space: SpaceRecord,
  viewerId: string,
): ClassroomSpaceSnapshot {
  const activeMembers = space.members.filter((member) => member.active);
  return {
    id: space.id,
    kind: space.kind === "main" ? "main" : "breakout",
    name: space.name,
    status:
      space.status === "open"
        ? "open"
        : space.status === "closed"
          ? "closed"
          : "waiting",
    position: space.position,
    capacity: space.capacity,
    memberCount: activeMembers.length,
    assistantCount: activeMembers.filter(
      (member) => member.role === "assistant",
    ).length,
    isAssigned: activeMembers.some((member) => member.userId === viewerId),
    members: activeMembers.map(publicMember),
  };
}

const memberSelect = {
  userId: true,
  displayName: true,
  avatar: true,
  role: true,
  active: true,
  microphoneAllowed: true,
  cameraAllowed: true,
  screenShareAllowed: true,
  joinedAt: true,
} as const;

export async function getClassroomSpaces(input: {
  courseId: string;
  viewerId: string;
  role: ClassroomRole;
}): Promise<ClassroomSpaceSnapshot[]> {
  const where =
    input.role === "teacher"
      ? { courseId: input.courseId }
      : {
          courseId: input.courseId,
          members: { some: { userId: input.viewerId, active: true } },
        };
  const spaces = await prisma.classroomSpace.findMany({
    where,
    include: { members: { select: memberSelect, orderBy: { assignedAt: "asc" } } },
    orderBy: { position: "asc" },
  });
  return spaces.map((space) => publicSpace(space, input.viewerId));
}

export async function ensureClassroomSpaceAssignment(input: {
  courseId: string;
  userId: string;
  displayName: string;
  avatar: string;
  role: ClassroomRole;
}) {
  if (input.role === "teacher") return null;
  const existing = await prisma.classroomSpaceMember.findFirst({
    where: { courseId: input.courseId, userId: input.userId, active: true },
    select: { spaceId: true },
  });
  if (existing) return existing.spaceId;
  const spaces = await prisma.classroomSpace.findMany({
    where: {
      courseId: input.courseId,
      kind: "breakout",
      status: { not: "closed" },
    },
    include: {
      members: { where: { active: true }, select: { role: true } },
    },
    orderBy: { position: "asc" },
  });
  const target = spaces
    .map((space) => ({
      space,
      students: space.members.filter((member) => member.role === "student").length,
      assistants: space.members.filter((member) => member.role === "assistant").length,
    }))
    .filter(
      ({ space, students }) =>
        input.role === "assistant" ||
        space.capacity === null ||
        students < space.capacity,
    )
    .sort((left, right) =>
      input.role === "assistant"
        ? left.assistants - right.assistants || left.space.position - right.space.position
        : left.students - right.students || left.space.position - right.space.position,
    )[0];
  if (!target) return null;
  await prisma.$transaction([
    prisma.classroomSpaceMember.upsert({
      where: {
        spaceId_userId: { spaceId: target.space.id, userId: input.userId },
      },
      create: {
        courseId: input.courseId,
        spaceId: target.space.id,
        userId: input.userId,
        displayName: input.displayName,
        avatar: input.avatar,
        role: input.role === "assistant" ? "assistant" : "student",
      },
      update: {
        displayName: input.displayName,
        avatar: input.avatar,
        role: input.role === "assistant" ? "assistant" : "student",
        active: true,
        assignedAt: new Date(),
        leftAt: null,
      },
    }),
    prisma.classroomRuntime.update({
      where: { courseId: input.courseId },
      data: { revision: { increment: 1 } },
    }),
  ]);
  return target.space.id;
}

async function assertLargeClass(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { roomType: true },
  });
  if (!course) throw new ClassroomSpaceError("课程不存在", 404);
  if (!classroomModePolicy(course.roomType).allowBreakouts) {
    throw new ClassroomSpaceError("当前课堂模式不支持分组教室", 409);
  }
}

async function incrementRevision(courseId: string) {
  const runtime = await ensureClassroomRuntime(courseId);
  return prisma.classroomRuntime.update({
    where: { id: runtime.id },
    data: { revision: { increment: 1 } },
    select: { revision: true },
  });
}

export async function createClassroomBreakouts(input: {
  courseId: string;
  actorRole: ClassroomRole;
  actorId: string;
  count: number;
  capacity?: number | null;
}): Promise<{ spaces: ClassroomSpaceSnapshot[]; revision: number }> {
  if (input.actorRole !== "teacher") {
    throw new ClassroomSpaceError("只有主讲老师可以创建分组教室", 403);
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 20) {
    throw new ClassroomSpaceError("分组教室数量必须在 1 到 20 之间");
  }
  if (
    input.capacity !== undefined &&
    input.capacity !== null &&
    (!Number.isInteger(input.capacity) || input.capacity < 2 || input.capacity > 50)
  ) {
    throw new ClassroomSpaceError("每个分组教室人数必须在 2 到 50 之间");
  }
  await assertLargeClass(input.courseId);
  await ensureClassroomRuntime(input.courseId);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.classroomSpace.findMany({
      where: { courseId: input.courseId, kind: "breakout" },
      orderBy: { position: "asc" },
    });
    if (existing.length > 0 && existing.length !== input.count) {
      throw new ClassroomSpaceError(
        "分组教室已经创建；重建前请先结束当前分组活动",
        409,
      );
    }
    if (existing.length === 0) {
      await tx.classroomSpace.createMany({
        data: Array.from({ length: input.count }, (_, index) => {
          const position = index + 1;
          return {
            courseId: input.courseId,
            kind: "breakout",
            name: `Room ${position}`,
            channelName: breakoutChannelName(input.courseId, position),
            position,
            capacity: input.capacity ?? null,
          };
        }),
      });
    }
    return tx.classroomRuntime.update({
      where: { courseId: input.courseId },
      data: { revision: { increment: existing.length === 0 ? 1 : 0 } },
      select: { revision: true },
    });
  });

  return {
    spaces: await getClassroomSpaces({
      courseId: input.courseId,
      viewerId: input.actorId,
      role: input.actorRole,
    }),
    revision: result.revision,
  };
}

type RosterMember = {
  userId: string;
  displayName: string;
  avatar: string;
  role: "assistant" | "student";
};

async function largeClassRoster(courseId: string): Promise<RosterMember[]> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      teachers: true,
      students: true,
      groupLinks: { include: { group: { include: { members: true } } } },
      classroomMembers: true,
    },
  });
  if (!course) throw new ClassroomSpaceError("课程不存在", 404);
  const roster = new Map<string, RosterMember>();
  for (const teacher of course.teachers) {
    if (teacher.teacherId === course.teacherId) continue;
    roster.set(teacher.teacherId, {
      userId: teacher.teacherId,
      displayName: teacher.teacherName || teacher.teacherId,
      avatar: teacher.teacherAvatar,
      role: "assistant",
    });
  }
  for (const student of course.students) {
    roster.set(student.studentId, {
      userId: student.studentId,
      displayName: student.studentName || student.studentId,
      avatar: student.studentAvatar,
      role: "student",
    });
  }
  for (const link of course.groupLinks) {
    for (const member of link.group.members) {
      if (!roster.has(member.userId)) {
        roster.set(member.userId, {
          userId: member.userId,
          displayName: member.userName || member.userId,
          avatar: member.userAvatar,
          role: "student",
        });
      }
    }
  }
  for (const member of course.classroomMembers) {
    if (member.role === "teacher") continue;
    roster.set(member.userId, {
      userId: member.userId,
      displayName: member.displayName || member.userId,
      avatar: member.avatar,
      role: member.role === "assistant" ? "assistant" : "student",
    });
  }
  return [...roster.values()];
}

export async function autoAssignClassroomSpaces(input: {
  courseId: string;
  actorRole: ClassroomRole;
  actorId: string;
}) {
  if (input.actorRole !== "teacher") {
    throw new ClassroomSpaceError("只有主讲老师可以自动分配成员", 403);
  }
  await assertLargeClass(input.courseId);
  const [spaces, roster] = await Promise.all([
    prisma.classroomSpace.findMany({
      where: { courseId: input.courseId, kind: "breakout" },
      orderBy: { position: "asc" },
    }),
    largeClassRoster(input.courseId),
  ]);
  if (spaces.length === 0) {
    throw new ClassroomSpaceError("请先创建分组教室", 409);
  }
  let planned: ReturnType<typeof planLargeClassAssignments>;
  try {
    planned = planLargeClassAssignments(spaces, roster);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new ClassroomSpaceError("分组教室容量不足，请增加教室或人数上限", 409);
    }
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    await tx.classroomSpaceMember.updateMany({
      where: { courseId: input.courseId, active: true },
      data: { active: false, leftAt: new Date() },
    });
    for (const assignment of planned) {
      const member = roster.find((candidate) => candidate.userId === assignment.userId)!;
      await tx.classroomSpaceMember.upsert({
        where: {
          spaceId_userId: {
            spaceId: assignment.spaceId,
            userId: member.userId,
          },
        },
        create: {
          courseId: input.courseId,
          spaceId: assignment.spaceId,
          ...member,
        },
        update: {
          displayName: member.displayName,
          avatar: member.avatar,
          role: member.role,
          active: true,
          assignedAt: new Date(),
          joinedAt: null,
          leftAt: null,
        },
      });
    }
    await tx.classroomRuntime.update({
      where: { courseId: input.courseId },
      data: { revision: { increment: 1 } },
    });
  });
  return {
    spaces: await getClassroomSpaces({
      courseId: input.courseId,
      viewerId: input.actorId,
      role: input.actorRole,
    }),
  };
}

export async function assignClassroomSpaceMember(input: {
  courseId: string;
  actorRole: ClassroomRole;
  actorId: string;
  spaceId: string;
  targetUserId: string;
  role: "assistant" | "student";
}) {
  if (input.actorRole !== "teacher") {
    throw new ClassroomSpaceError("只有主讲老师可以调整分组", 403);
  }
  await assertLargeClass(input.courseId);
  const [space, roster] = await Promise.all([
    prisma.classroomSpace.findFirst({
      where: { id: input.spaceId, courseId: input.courseId },
      include: { members: { where: { active: true, role: "student" } } },
    }),
    largeClassRoster(input.courseId),
  ]);
  if (!space) throw new ClassroomSpaceError("分组教室不存在", 404);
  const member = roster.find(
    (candidate) =>
      candidate.userId === input.targetUserId && candidate.role === input.role,
  );
  if (!member) throw new ClassroomSpaceError("课程成员不存在", 404);
  const alreadyHere = space.members.some((item) => item.userId === member.userId);
  if (
    member.role === "student" &&
    !alreadyHere &&
    space.capacity !== null &&
    space.members.length >= space.capacity
  ) {
    throw new ClassroomSpaceError("该分组教室已满", 409);
  }
  await prisma.$transaction(async (tx) => {
    await tx.classroomSpaceMember.updateMany({
      where: { courseId: input.courseId, userId: member.userId, active: true },
      data: { active: false, leftAt: new Date() },
    });
    await tx.classroomSpaceMember.upsert({
      where: { spaceId_userId: { spaceId: space.id, userId: member.userId } },
      create: { courseId: input.courseId, spaceId: space.id, ...member },
      update: {
        displayName: member.displayName,
        avatar: member.avatar,
        role: member.role,
        active: true,
        assignedAt: new Date(),
        joinedAt: null,
        leftAt: null,
      },
    });
    await tx.classroomRuntime.update({
      where: { courseId: input.courseId },
      data: { revision: { increment: 1 } },
    });
  });
  return getClassroomSpaces({
    courseId: input.courseId,
    viewerId: input.actorId,
    role: input.actorRole,
  });
}

export async function updateClassroomSpace(input: {
  courseId: string;
  actorRole: ClassroomRole;
  actorId: string;
  spaceId?: string;
  action: "open" | "close" | "rename" | "permissions" | "removeMember";
  name?: string;
  targetUserId?: string;
  microphoneAllowed?: boolean;
  cameraAllowed?: boolean;
  screenShareAllowed?: boolean;
}) {
  await assertLargeClass(input.courseId);
  const assistantManagingOwnRoom =
    input.actorRole === "assistant" &&
    input.action === "permissions" &&
    Boolean(input.spaceId) &&
    Boolean(
      await prisma.classroomSpaceMember.findFirst({
        where: {
          courseId: input.courseId,
          spaceId: input.spaceId,
          userId: input.actorId,
          role: "assistant",
          active: true,
        },
        select: { id: true },
      }),
    );
  if (input.actorRole !== "teacher" && !assistantManagingOwnRoom) {
    throw new ClassroomSpaceError("你无权调整该分组教室", 403);
  }
  if (input.action === "open" || input.action === "close") {
    await prisma.classroomSpace.updateMany({
      where: {
        courseId: input.courseId,
        ...(input.spaceId && { id: input.spaceId }),
      },
      data: { status: input.action === "open" ? "open" : "closed" },
    });
  } else if (input.action === "rename") {
    const name = input.name?.trim();
    if (!input.spaceId || !name || name.length > 40) {
      throw new ClassroomSpaceError("教室名称长度应为 1–40 个字符");
    }
    await prisma.classroomSpace.updateMany({
      where: { id: input.spaceId, courseId: input.courseId },
      data: { name },
    });
  } else {
    if (!input.spaceId || !input.targetUserId) {
      throw new ClassroomSpaceError("缺少分组成员信息");
    }
    const data =
      input.action === "removeMember"
        ? { active: false, leftAt: new Date() }
        : {
            ...(typeof input.microphoneAllowed === "boolean" && {
              microphoneAllowed: input.microphoneAllowed,
            }),
            ...(typeof input.cameraAllowed === "boolean" && {
              cameraAllowed: input.cameraAllowed,
            }),
            ...(typeof input.screenShareAllowed === "boolean" && {
              screenShareAllowed: input.screenShareAllowed,
            }),
          };
    const result = await prisma.classroomSpaceMember.updateMany({
      where: {
        courseId: input.courseId,
        spaceId: input.spaceId,
        userId: input.targetUserId,
        active: true,
      },
      data,
    });
    if (result.count === 0) throw new ClassroomSpaceError("分组成员不存在", 404);
  }
  const runtime = await incrementRevision(input.courseId);
  return {
    spaces: await getClassroomSpaces({
      courseId: input.courseId,
      viewerId: input.actorId,
      role: input.actorRole,
    }),
    revision: runtime.revision,
  };
}

export async function deleteClassroomBreakouts(input: {
  courseId: string;
  actorRole: ClassroomRole;
}) {
  if (input.actorRole !== "teacher") {
    throw new ClassroomSpaceError("只有主讲老师可以重置分组教室", 403);
  }
  const open = await prisma.classroomSpace.count({
    where: { courseId: input.courseId, status: "open" },
  });
  if (open > 0) throw new ClassroomSpaceError("请先结束分组活动", 409);
  await prisma.$transaction([
    prisma.classroomSpace.deleteMany({ where: { courseId: input.courseId } }),
    prisma.classroomRuntime.update({
      where: { courseId: input.courseId },
      data: { revision: { increment: 1 } },
    }),
  ]);
}

export async function getClassroomSpaceCredentialAccess(input: {
  courseId: string;
  spaceId: string;
  viewerId: string;
  role: ClassroomRole;
}) {
  const space = await prisma.classroomSpace.findFirst({
    where: { id: input.spaceId, courseId: input.courseId },
    include: {
      members: {
        where: { userId: input.viewerId, active: true },
        take: 1,
      },
    },
  });
  if (!space) throw new ClassroomSpaceError("分组教室不存在", 404);
  if (space.status !== "open") {
    throw new ClassroomSpaceError("分组教室尚未开放", 409);
  }
  const membership = space.members[0] ?? null;
  if (input.role !== "teacher" && !membership) {
    throw new ClassroomSpaceError("你尚未被分配到该教室", 403);
  }
  return {
    id: space.id,
    name: space.name,
    channelName: space.channelName,
    membership,
    publisher: input.role !== "teacher" && Boolean(membership),
    allowScreenShare:
      input.role === "assistant" || Boolean(membership?.screenShareAllowed),
  };
}
