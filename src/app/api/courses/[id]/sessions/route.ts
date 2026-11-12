import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { assertCanTeachCourse } from "@/lib/course-teacher";
import {
  CourseSessionError,
  createCourseSessions,
  serializeCourseSession,
} from "@/lib/course-session-service";
import {getViewerSessionRoles} from "@/lib/course-session-viewer";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { serializeStudentSubmission } from "@/lib/course-session-submission";
import { syncCourseStatusFromSessions } from "@/lib/course-session-status";
import { createHash } from "node:crypto";
import { taskRequestId } from "@/lib/workspace-task-validation";
import { supportedSessionTeacherRules } from "@/lib/course-session-roster-rules";

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
      studentSubmissions: { orderBy: { updatedAt: "desc" } },
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
  const viewerRoles = canManage ? new Map<string, "teacher"|"assistant"|"student">() : await getViewerSessionRoles(sessions.map(item=>item.id),aliases);
  const visible = canManage ? sessions : sessions.filter(item=>viewerRoles.has(item.id));

  return NextResponse.json({
    canManage,
    sessions: visible.map((item) => {
      const serialized = serializeCourseSession(item);
      if (canManage) {
        return {
          ...serialized,
          studentSubmissions: undefined,
          submissionSummary: {
            leaveCount: item.studentSubmissions.filter(
              (submission) => submission.leaveStatus === "active",
            ).length,
            requirementsCount: item.studentSubmissions.filter(
              (submission) => Boolean(submission.requirements.trim()),
            ).length,
          },
        };
      }
      const mine = item.studentSubmissions.find((submission) =>
        aliases.some((alias) => casdoorUserIdsMatch(submission.studentId, alias)),
      );
      return {
        ...serialized,
        ...(viewerRoles.get(item.id)==="observer"?{teachers:[],students:[],groupLinks:[],_count:{recordings:item._count.recordings}}:{}),
        studentSubmissions: undefined,
        viewerRole: viewerRoles.get(item.id),
        mySubmission: viewerRoles.get(item.id)==="observer"?null:serializeStudentSubmission(mine),
      };
    }),
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
    if (!supportedSessionTeacherRules(body?.teachers)) throw new CourseSessionError("Unsupported lesson staff role");
    if (body?.programId != null && (typeof body.programId !== "string" || !body.programId || body.programId.length > 100)) throw new CourseSessionError("Invalid course");
    if (body?.unitId != null && (typeof body.unitId !== "string" || !body.unitId || body.unitId.length > 100)) throw new CourseSessionError("Invalid unit");
    const rawRequestId = request.headers.get("Idempotency-Key");
    let requestId: string | undefined;
    if (rawRequestId !== null) { try { requestId = taskRequestId(rawRequestId); } catch { throw new CourseSessionError("Invalid request id"); } }
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
      programId: body?.programId || null,
      unitId: body?.unitId || null,
      creationRequest: requestId ? { id: requestId, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex") } : undefined,
    });
    await syncCourseStatusFromSessions(courseId);
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
