/**
 * Student Group management API
 * GET  /api/groups — list groups (teacher: own; includes hierarchy)
 * POST /api/groups — create group, add members, link / unlink course, etc.
 */
import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { assertCourseOwner } from "@/lib/course-teacher";
import { getSessionFromRequest } from "@/lib/session";
import { searchCasdoorUsers } from "@/lib/casdoor-server";
import { enrichGroupIdentities } from "@/lib/group-member-identity";
import { prisma } from "@/lib/db";
import { taskRequestId } from "@/lib/workspace-task-validation";
import { resolveDirectoryStudents } from "@/lib/user-directory";

export const dynamic = "force-dynamic";
class GroupCreationConflict extends Error {}

function validId(value: unknown, max = 200): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= max;
}

function validMember(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const member = value as { userId?: unknown; userName?: unknown; userAvatar?: unknown };
  return validId(member.userId) &&
    (member.userName === undefined || (typeof member.userName === "string" && member.userName.length <= 200)) &&
    (member.userAvatar === undefined || (typeof member.userAvatar === "string" && member.userAvatar.length <= 2048));
}

async function assertTeacherOwnsGroup(
  userId: string,
  groupId: string
): Promise<boolean> {
  const group = await prisma.studentGroup.findUnique({
    where: { id: groupId },
    select: { createdBy: true },
  });
  return Boolean(group && casdoorUserIdsMatch(group.createdBy, userId));
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const groups = await prisma.studentGroup.findMany({
      where: { createdBy: session.userId },
      include: {
        members: true,
        children: {
          include: {
            members: true,
            children: {
              include: { members: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const directory = groups.some(group => group.members.some(member => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(member.userId.split("/").pop() || "")))
      ? await searchCasdoorUsers("", { studentsOnly: false, limit: Number.MAX_SAFE_INTEGER, timeoutMs: 2_000 }) : [];
    const rootGroups = enrichGroupIdentities(groups.filter(
      (g: { parentId: string | null }) => !g.parentId
    ), directory);
    return NextResponse.json(
      { groups: rootGroups },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch groups:", error);
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json(
      { error: "Only teachers can manage groups" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "create": {
        const { name, parentId } = body;
        if (!validId(name, 100) || (parentId != null && !validId(parentId, 100))) {
          return NextResponse.json(
            { error: "Group name is required" },
            { status: 400 }
          );
        }
        const suppliedKey = request.headers.get("Idempotency-Key");
        let requestId: string | null = null;
        if (suppliedKey !== null) {
          try { requestId = taskRequestId(suppliedKey); }
          catch { return NextResponse.json({ error: "Invalid request id" }, { status: 400 }); }
        }
        if (requestId) {
          const normalizedName = name.trim(), normalizedParent = parentId || null;
          const receiptKey = { actorId_requestId: { actorId: session.userId, requestId } };
          const existing = async () => {
            const receipt = await prisma.groupCreationReceipt.findUnique({ where: receiptKey });
            if (!receipt) return null;
            if (receipt.name !== normalizedName || receipt.parentId !== normalizedParent) throw new GroupCreationConflict();
            const group = await prisma.studentGroup.findFirst({ where: { id: receipt.groupId, createdBy: session.userId } });
            if (!group) throw new GroupCreationConflict();
            return group;
          };
          try {
            const previous = await existing();
            if (previous) return NextResponse.json({ group: previous }, { status: 201 });
            const group = await prisma.$transaction(async tx => {
              if (normalizedParent) {
                const parent = await tx.studentGroup.findUnique({ where: { id: normalizedParent }, select: { createdBy: true } });
                if (!parent || !casdoorUserIdsMatch(parent.createdBy, session.userId)) return null;
              }
              const created = await tx.studentGroup.create({ data: { name: normalizedName, parentId: normalizedParent, createdBy: session.userId } });
              await tx.groupCreationReceipt.create({ data: { actorId: session.userId, requestId, groupId: created.id, name: normalizedName, parentId: normalizedParent } });
              return created;
            }, { isolationLevel: "Serializable" });
            return group ? NextResponse.json({ group }, { status: 201 }) : NextResponse.json({ error: "Forbidden" }, { status: 403 });
          } catch (error) {
            if (error instanceof GroupCreationConflict) return NextResponse.json({ error: "Request id already used or group unavailable" }, { status: 409 });
            if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
              try { const previous = await existing(); if (previous) return NextResponse.json({ group: previous }, { status: 201 }); }
              catch (cause) { if (cause instanceof GroupCreationConflict) return NextResponse.json({ error: "Request id already used or group unavailable" }, { status: 409 }); throw cause; }
            }
            return NextResponse.json({ error: "Unable to create group; retry the same request" }, { status: 503 });
          }
        }
        if (parentId && !(await assertTeacherOwnsGroup(session.userId, parentId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const group = await prisma.studentGroup.create({
          data: {
            name: name.trim(),
            parentId: parentId || null,
            createdBy: session.userId,
          },
        });
        return NextResponse.json({ group }, { status: 201 });
      }

      case "addMembers": {
        const { groupId, members } = body;
        if (!validId(groupId, 100) || !Array.isArray(members) || !members.length || members.length > 200 || !members.every(validMember)) {
          return NextResponse.json(
            { error: "groupId and members required" },
            { status: 400 }
          );
        }
        if (!(await assertTeacherOwnsGroup(session.userId, groupId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        let students;
        try { students = await resolveDirectoryStudents(members.map((member: {userId:string})=>member.userId)); }
        catch { return NextResponse.json({ error: "Student directory unavailable" }, { status: 503 }); }
        if (!students) return NextResponse.json({ error: "One or more students are unavailable" }, { status: 400 });
        const result = await prisma.groupMember.createMany({
          data: students.map((student) => ({
            groupId,
            userId: student.id,
            userName: student.displayName,
            userAvatar: student.avatar || "",
          })),
          skipDuplicates: true,
        });
        return NextResponse.json({ added: result.count });
      }

      case "removeMembers": {
        const { groupId: gId, userIds } = body;
        if (!validId(gId, 100) || !Array.isArray(userIds) || !userIds.length || userIds.length > 200 || !userIds.every((id:unknown)=>validId(id))) {
          return NextResponse.json(
            { error: "groupId and userIds required" },
            { status: 400 }
          );
        }
        if (!(await assertTeacherOwnsGroup(session.userId, gId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        await prisma.groupMember.deleteMany({
          where: { groupId: gId, userId: { in: userIds } },
        });
        return NextResponse.json({ success: true });
      }

      case "linkToCourse": {
        const { groupId: linkGroupId, courseId } = body;
        if (!linkGroupId || !courseId) {
          return NextResponse.json(
            { error: "groupId and courseId required" },
            { status: 400 }
          );
        }
        const courseForLink = await prisma.course.findUnique({
          where: { id: courseId },
          select: { roomType: true },
        });
        if (!courseForLink || !(await assertCourseOwner(session.userId, courseId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (courseForLink.roomType === 0) {
          return NextResponse.json(
            { error: "一对一课程不支持关联学生组" },
            { status: 400 }
          );
        }
        if (!(await assertTeacherOwnsGroup(session.userId, linkGroupId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const existing = await prisma.courseGroupLink.findUnique({
          where: {
            courseId_groupId: { courseId, groupId: linkGroupId },
          },
        });
        if (existing) {
          return NextResponse.json({ link: existing });
        }

        const link = await prisma.courseGroupLink.create({
          data: { courseId, groupId: linkGroupId },
        });
        return NextResponse.json({ link });
      }

      case "unlinkFromCourse": {
        const { groupId: unlinkGid, courseId: unlinkCid } = body;
        if (!unlinkGid || !unlinkCid) {
          return NextResponse.json(
            { error: "groupId and courseId required" },
            { status: 400 }
          );
        }
        if (!(await assertCourseOwner(session.userId, unlinkCid))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (!(await assertTeacherOwnsGroup(session.userId, unlinkGid))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        await prisma.courseGroupLink.deleteMany({
          where: { courseId: unlinkCid, groupId: unlinkGid },
        });
        return NextResponse.json({ success: true });
      }

      case "delete": {
        const { groupId: delId } = body;
        if (!delId) {
          return NextResponse.json(
            { error: "groupId required" },
            { status: 400 }
          );
        }
        if (!(await assertTeacherOwnsGroup(session.userId, delId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        await prisma.studentGroup.delete({ where: { id: delId } });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Group operation failed:", error);
    return NextResponse.json(
      { error: "Group operation failed" },
      { status: 500 }
    );
  }
}
