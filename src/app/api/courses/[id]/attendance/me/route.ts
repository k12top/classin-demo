import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { summarizeStudentAttendance } from "@/lib/student-attendance";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getSessionFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        students: { select: { studentId: true } },
        groupLinks: {
          select: {
            group: { select: { members: { select: { userId: true } } } },
          },
        },
        sessions: {
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            title: true,
            status: true,
            startTime: true,
            endTime: true,
            studentMode: true,
            students: {
              select: { studentId: true, action: true },
            },
            groupLinks: {
              select: {
                action: true,
                group: { select: { members: { select: { userId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const identityCandidates = Array.from(
      new Set(
        [auth.userId, auth.name || ""]
          .flatMap(casdoorUserIdCandidates)
          .filter(Boolean),
      ),
    );
    const isCourseStudent =
      course.students.some((student) =>
        identityCandidates.some((candidate) =>
          casdoorUserIdsMatch(student.studentId, candidate),
        ),
      ) ||
      course.groupLinks.some((link) =>
        link.group.members.some((member) =>
          identityCandidates.some((candidate) =>
            casdoorUserIdsMatch(member.userId, candidate),
          ),
        ),
      );

    const identityMatches = (value: string) =>
      identityCandidates.some((candidate) => casdoorUserIdsMatch(value, candidate));
    const visibleLessons = course.sessions.filter((lesson) => {
      let visible = lesson.studentMode !== "custom" && isCourseStudent;
      for (const rule of lesson.groupLinks) {
        if (!rule.group.members.some((member) => identityMatches(member.userId))) continue;
        visible = rule.action !== "exclude";
      }
      const directRule = lesson.students.find((rule) => identityMatches(rule.studentId));
      if (directRule) visible = directRule.action !== "exclude";
      return visible;
    });

    if (!isCourseStudent && visibleLessons.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [rows, activeLeaveSubmissions] = visibleLessons.length
      ? await Promise.all([prisma.courseAttendance.findMany({
          where: {
            sessionId: { in: visibleLessons.map((lesson) => lesson.id) },
            studentId: { in: identityCandidates },
          },
          select: {
            sessionId: true,
            enteredAt: true,
            leftAt: true,
            durationSec: true,
          },
          orderBy: { enteredAt: "asc" },
        }), prisma.courseSessionStudentSubmission.findMany({
          where: {
            sessionId: { in: visibleLessons.map((lesson) => lesson.id) },
            leaveStatus: "active",
          },
          select: { sessionId: true, studentId: true },
        })])
      : [[], []];
    const result = summarizeStudentAttendance(
      visibleLessons,
      rows,
      activeLeaveSubmissions
        .filter((leave) => identityMatches(leave.studentId))
        .map((leave) => ({ sessionId: leave.sessionId, active: true })),
    );

    return NextResponse.json(
      {
        summary: result.summary,
        lessons: result.lessons.map((lesson) => ({
          ...lesson,
          startTime: lesson.startTime.toISOString(),
          endTime: lesson.endTime.toISOString(),
          firstEnteredAt: lesson.firstEnteredAt?.toISOString() || null,
          lastActivityAt: lesson.lastActivityAt?.toISOString() || null,
        })),
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Failed to load student attendance", { courseId, error });
    return NextResponse.json(
      { error: "Attendance service temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
