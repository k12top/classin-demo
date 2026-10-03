import { NextRequest, NextResponse } from "next/server";
import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { assertCanTeachCourse } from "@/lib/course-teacher";
import { getEffectiveSessionRoster } from "@/lib/course-session-roster";
import { serializeStudentSubmission } from "@/lib/course-session-submission";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await getSessionFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await params;
  const lesson = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      courseId: true,
      course: { select: { studentRemarks: true } },
    },
  });
  if (!lesson) return NextResponse.json({ error: "课次不存在" }, { status: 404 });
  if (auth.role !== "teacher" || !(await assertCanTeachCourse(auth.userId, lesson.courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [roster, submissions] = await Promise.all([
    getEffectiveSessionRoster(sessionId),
    prisma.courseSessionStudentSubmission.findMany({
      where: { sessionId },
      orderBy: [{ leaveRequestedAt: "desc" }, { updatedAt: "desc" }],
    }),
  ]);
  if (!roster) return NextResponse.json({ error: "课次不存在" }, { status: 404 });

  return NextResponse.json(
    {
      submissions: roster.students.map((student) => {
        const submission = submissions.find((item) =>
          casdoorUserIdsMatch(item.studentId, student.userId),
        );
        return {
          studentId: student.userId,
          studentName: student.displayName,
          studentAvatar: student.avatar,
          ...serializeStudentSubmission(submission),
        };
      }),
      legacyStudentRemarks: lesson.course.studentRemarks || "",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
