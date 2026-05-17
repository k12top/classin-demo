/**
 * Student Group management API
 * GET  /api/groups — list groups (teacher: own; includes hierarchy)
 * POST /api/groups — create group, add members, link / unlink course, etc.
 */
import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";

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

async function assertTeacherOwnsCourse(
  userId: string,
  courseId: string
): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { teacherId: true },
  });
  return Boolean(course && casdoorUserIdsMatch(course.teacherId, userId));
}

export async function GET() {
  const session = await getSession();
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

    const rootGroups = groups.filter(
      (g: { parentId: string | null }) => !g.parentId
    );
    return NextResponse.json({ groups: rootGroups });
  } catch (error) {
    console.error("Failed to fetch groups:", error);
    return NextResponse.json(
      { error: "Failed to fetch groups" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
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
        if (!name?.trim()) {
          return NextResponse.json(
            { error: "Group name is required" },
            { status: 400 }
          );
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
        if (!groupId || !Array.isArray(members)) {
          return NextResponse.json(
            { error: "groupId and members required" },
            { status: 400 }
          );
        }
        if (!(await assertTeacherOwnsGroup(session.userId, groupId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const result = await prisma.groupMember.createMany({
          data: members.map((m: { userId: string; userName?: string }) => ({
            groupId,
            userId: m.userId,
            userName: m.userName || "",
          })),
          skipDuplicates: true,
        });
        return NextResponse.json({ added: result.count });
      }

      case "removeMembers": {
        const { groupId: gId, userIds } = body;
        if (!gId || !Array.isArray(userIds)) {
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
        if (!(await assertTeacherOwnsCourse(session.userId, courseId))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        if (!(await assertTeacherOwnsCourse(session.userId, unlinkCid))) {
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
