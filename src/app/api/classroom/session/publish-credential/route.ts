import { NextRequest, NextResponse } from "next/server";
import { getClassroomServerProvider } from "@/lib/classroom/server/provider-factory";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { prisma } from "@/lib/db";
import { classroomModePolicy } from "@/lib/classroom/mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    courseId?: unknown;
    shareAccess?: unknown;
  } | null;
  const courseId =
    typeof body?.courseId === "string" ? body.courseId.trim() : "";
  if (!courseId) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }
  const resolved = await resolveClassroomRequestAccess(
    request,
    courseId,
    typeof body?.shareAccess === "string" ? body.shareAccess : null,
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const sessionId = resolved.access.sessionId;
  const [lesson, member] = await Promise.all([
    prisma.courseSession.findUnique({
      where: { id: sessionId },
      select: { classroomProvider: true, roomType: true },
    }),
    prisma.classroomMemberState.findUnique({
      where: {
        sessionId_userId: {
          sessionId,
          userId: resolved.session.userId,
        },
      },
    }),
  ]);
  if (!lesson || !member) {
    return NextResponse.json({ error: "课堂成员不存在" }, { status: 404 });
  }
  const teachingRole =
    resolved.access.role === "teacher" ||
    resolved.access.role === "assistant";
  const acceptedStudent =
    resolved.access.role === "student" &&
    member.onStage &&
    member.stageState === "accepted";
  const mode = classroomModePolicy(lesson.roomType);
  const defaultStudentPublisher =
    resolved.access.role === "student" && mode.defaultStudentOnStage;
  if (!teachingRole && !acceptedStudent && !defaultStudentPublisher) {
    return NextResponse.json(
      { error: "接受老师的上台邀请后才能开启音视频" },
      { status: 403 },
    );
  }

  const credential = getClassroomServerProvider(
    lesson.classroomProvider,
  ).issueCredential({
    channelName: resolved.access.roomUuid,
    userId: resolved.session.userId,
    role: resolved.access.role,
    scenario: mode.rtcScenario,
    publisher: true,
    // An accepted stage invitation is also the teacher's authorization for
    // that student to present their desktop. The browser still requires the
    // student to explicitly choose a screen, so no device can be opened
    // remotely.
    allowScreenShare:
      teachingRole ||
      ((acceptedStudent || defaultStudentPublisher) &&
        mode.studentCanShareWhenOnStage),
  });
  return NextResponse.json({ credential });
}
