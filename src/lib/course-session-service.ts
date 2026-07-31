import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateCourseRoomUuid } from "@/lib/course-room";
import {
  expandSessionSchedule,
  SessionScheduleError,
  type SessionScheduleInput,
} from "@/lib/course-session-schedule";

type MemberRuleInput = {
  userId?: string;
  id?: string;
  displayName?: string;
  name?: string;
  avatar?: string;
  action?: string;
  role?: string;
};

type GroupRuleInput = {
  groupId?: string;
  id?: string;
  action?: string;
};

export type CreateCourseSessionsInput = {
  courseId: string;
  createdBy: string;
  title?: string;
  schedule: SessionScheduleInput;
  roomType?: number;
  teacherMode?: string;
  studentMode?: string;
  leadTeacherId?: string;
  teachers?: MemberRuleInput[];
  students?: MemberRuleInput[];
  groups?: GroupRuleInput[];
};

export class CourseSessionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CourseSessionError";
    this.status = status;
  }
}

function normalizedMode(value: string | undefined): "inherit" | "custom" {
  return value === "custom" ? "custom" : "inherit";
}

function normalizeMemberRules(values: MemberRuleInput[] | undefined) {
  const result = new Map<string, Required<Omit<MemberRuleInput, "id" | "name">>>();
  for (const value of values || []) {
    const userId = (value.userId || value.id || "").trim();
    if (!userId) continue;
    result.set(userId, {
      userId,
      displayName: (value.displayName || value.name || userId).trim(),
      avatar: (value.avatar || "").trim(),
      action: value.action === "exclude" ? "exclude" : "include",
      role: value.role === "teacher" ? "teacher" : "assistant",
    });
  }
  return Array.from(result.values());
}

function normalizeGroupRules(values: GroupRuleInput[] | undefined) {
  const result = new Map<string, { groupId: string; action: "include" | "exclude" }>();
  for (const value of values || []) {
    const groupId = (value.groupId || value.id || "").trim();
    if (!groupId) continue;
    result.set(groupId, {
      groupId,
      action: value.action === "exclude" ? "exclude" : "include",
    });
  }
  return Array.from(result.values());
}

export async function createCourseSessions(input: CreateCourseSessionsInput) {
  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    include: { teachers: { orderBy: { createdAt: "asc" } } },
  });
  if (!course) throw new CourseSessionError("课程不存在", 404);

  let occurrences: ReturnType<typeof expandSessionSchedule>;
  try {
    occurrences = expandSessionSchedule(input.schedule);
  } catch (error) {
    if (error instanceof SessionScheduleError) {
      throw new CourseSessionError(error.message);
    }
    throw error;
  }
  if (course.courseKind === "standalone") {
    if (occurrences.length !== 1) {
      throw new CourseSessionError("单独课程不支持周期排课");
    }
    const existingSessionCount = await prisma.courseSession.count({
      where: { courseId: course.id },
    });
    if (existingSessionCount > 0) {
      throw new CourseSessionError("单独课程只能包含一个课次", 409);
    }
  }
  const teacherMode = normalizedMode(input.teacherMode);
  const studentMode = normalizedMode(input.studentMode);
  const teacherRules = normalizeMemberRules(input.teachers);
  const studentRules = normalizeMemberRules(input.students);
  const groupRules = normalizeGroupRules(input.groups);
  if (groupRules.length > 0) {
    const allowedGroups = await prisma.studentGroup.count({
      where: {
        id: { in: groupRules.map((rule) => rule.groupId) },
        OR: [
          { createdBy: input.createdBy },
          { createdBy: course.ownerId },
          { courseLinks: { some: { courseId: course.id } } },
        ],
      },
    });
    if (allowedGroups !== groupRules.length) {
      throw new CourseSessionError("包含无权使用的学生组", 403);
    }
  }
  const leadTeacherId = (input.leadTeacherId || course.teacherId).trim();

  const inheritedTeacherIds = new Set(
    (course.teachers.length ? course.teachers : [{ teacherId: course.teacherId }])
      .map((teacher) => teacher.teacherId),
  );
  const includedTeacherIds = new Set(
    teacherRules
      .filter((teacher) => teacher.action === "include")
      .map((teacher) => teacher.userId),
  );
  const excludedTeacherIds = new Set(
    teacherRules
      .filter((teacher) => teacher.action === "exclude")
      .map((teacher) => teacher.userId),
  );
  const leadAvailable =
    includedTeacherIds.has(leadTeacherId) ||
    (teacherMode === "inherit" &&
      inheritedTeacherIds.has(leadTeacherId) &&
      !excludedTeacherIds.has(leadTeacherId));
  if (!leadAvailable) {
    throw new CourseSessionError("课次主讲老师必须存在于有效教师名单中");
  }

  const leadRule = teacherRules.find((teacher) => teacher.userId === leadTeacherId);
  const inheritedLead = course.teachers.find((teacher) => teacher.teacherId === leadTeacherId);
  const leadTeacherName =
    leadRule?.displayName || inheritedLead?.teacherName ||
    (leadTeacherId === course.teacherId ? course.teacherName : leadTeacherId);
  const leadTeacherAvatar =
    leadRule?.avatar || inheritedLead?.teacherAvatar ||
    (leadTeacherId === course.teacherId ? course.teacherAvatar : "");

  const last = await prisma.courseSession.aggregate({
    where: { courseId: course.id },
    _max: { position: true },
  });
  const firstPosition = (last._max.position || 0) + 1;
  const seriesId = input.schedule.type === "recurring" ? randomUUID() : null;
  const recurrenceRule: Prisma.InputJsonValue | null = input.schedule.type === "recurring"
    ? {
        weekdays: input.schedule.weekdays,
        count: input.schedule.count ?? null,
        untilDate: input.schedule.untilDate ?? null,
        firstDate: input.schedule.firstDate,
        localStartTime: input.schedule.localStartTime,
      }
    : null;

  return prisma.$transaction(async (transaction) => {
    if (seriesId && input.schedule.type === "recurring" && recurrenceRule) {
      await transaction.courseSessionSeries.create({
        data: {
          id: seriesId,
          courseId: course.id,
          timezone: input.schedule.timezone,
          recurrenceRule,
          durationMinutes: input.schedule.durationMinutes,
          createdBy: input.createdBy,
        },
      });
    }

    const sessions = [];
    for (const [index, occurrence] of occurrences.entries()) {
      const position = firstPosition + index;
      const session = await transaction.courseSession.create({
        data: {
          courseId: course.id,
          seriesId,
          title: (input.title || "").trim() || `${course.name} · 第 ${position} 课`,
          position,
          roomUuid: generateCourseRoomUuid(),
          roomType: Number.isInteger(input.roomType) ? input.roomType! : course.roomType,
          classroomProvider: course.classroomProvider,
          recordingProvider: course.recordingProvider,
          teacherMode,
          studentMode,
          leadTeacherId,
          leadTeacherName,
          leadTeacherAvatar,
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
          createdBy: input.createdBy,
          teachers: {
            create: teacherRules.map((teacher) => ({
              courseId: course.id,
              teacherId: teacher.userId,
              teacherName: teacher.displayName,
              teacherAvatar: teacher.avatar,
              action: teacher.action,
              role: teacher.userId === leadTeacherId ? "teacher" : teacher.role,
            })),
          },
          students: {
            create: studentRules.map((student) => ({
              courseId: course.id,
              studentId: student.userId,
              studentName: student.displayName,
              studentAvatar: student.avatar,
              action: student.action,
            })),
          },
          groupLinks: {
            create: groupRules.map((group) => ({
              courseId: course.id,
              groupId: group.groupId,
              action: group.action,
            })),
          },
        },
        include: {
          teachers: true,
          students: true,
          groupLinks: true,
        },
      });
      sessions.push(session);
    }

    const previousCount = firstPosition - 1;
    const first = sessions[0];
    await transaction.course.update({
      where: { id: course.id },
      data: {
        lifecycleStatus: "active",
        ...(previousCount === 0 && first
          ? {
              roomUuid: first.roomUuid,
              startTime: first.startTime,
              endTime: first.endTime,
              status: first.status,
            }
          : {}),
      },
    });
    return sessions;
  });
}

export function serializeCourseSession<T extends {
  startTime: Date;
  endTime: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>(session: T) {
  return {
    ...session,
    startTime: session.startTime.toISOString(),
    endTime: session.endTime.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
