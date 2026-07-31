import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { assertCanTeachCourse } from "@/lib/course-teacher";
import {
  CourseSessionError,
  createCourseSessions,
  serializeCourseSession,
} from "@/lib/course-session-service";
import {
  getEffectiveSessionRoster,
  rosterContainsUser,
} from "@/lib/course-session-roster";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: courseId } = await params;
  const canManage = session.role === "teacher" &&
    (await assertCanTeachCourse(session.userId, courseId));

  const sessions = await prisma.courseSession.findMany({
    where: { courseId },
    include: {
      series: true,
      teachers: { orderBy: { createdAt: "asc" } },
      students: { orderBy: { createdAt: "asc" } },
      groupLinks: { orderBy: { createdAt: "asc" } },
      _count: {
        select: {
          teachers: true,
          students: true,
          attendances: true,
          recordings: true,
        },
      },
    },
    orderBy: [{ startTime: "asc" }, { position: "asc" }],
  });
  if (sessions.length === 0) {
    const courseExists = await prisma.course.count({ where: { id: courseId } });
    if (!courseExists) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const aliases = Array.from(
    new Set([
      ...casdoorUserIdCandidates(session.userId),
      ...casdoorUserIdCandidates(session.name || ""),
    ]),
  );
  const visible = canManage
    ? sessions
    : (
        await Promise.all(
          sessions.map(async (item) => {
            const roster = await getEffectiveSessionRoster(item.id);
            return roster && rosterContainsUser(roster, aliases) ? item : null;
          }),
        )
      ).filter((item): item is (typeof sessions)[number] => Boolean(item));

  return NextResponse.json({
    canManage,
    sessions: visible.map(serializeCourseSession),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: courseId } = await params;
  if (session.role !== "teacher" || !(await assertCanTeachCourse(session.userId, courseId))) {
    return NextResponse.json({ error: "Only course teachers can schedule lessons" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const sessions = await createCourseSessions({
      courseId,
      createdBy: session.userId,
      title: typeof body?.title === "string" ? body.title : undefined,
      schedule: body?.schedule,
      roomType: typeof body?.roomType === "number" ? body.roomType : undefined,
      teacherMode: typeof body?.teacherMode === "string" ? body.teacherMode : undefined,
      studentMode: typeof body?.studentMode === "string" ? body.studentMode : undefined,
      leadTeacherId: typeof body?.leadTeacherId === "string" ? body.leadTeacherId : undefined,
      teachers: Array.isArray(body?.teachers) ? body.teachers : undefined,
      students: Array.isArray(body?.students) ? body.students : undefined,
      groups: Array.isArray(body?.groups) ? body.groups : undefined,
    });
    return NextResponse.json(
      { sessions: sessions.map(serializeCourseSession) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CourseSessionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to create course sessions", { courseId, error });
    return NextResponse.json({ error: "Failed to create course sessions" }, { status: 500 });
  }
}
