import { canShareClassroomScreen } from "@/lib/classroom/screen-share-state";
import { NextRequest, NextResponse } from "next/server";
import { normalizeClassroomClientId } from "@/lib/classroom/server/connections";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { getClassroomServerProvider } from "@/lib/classroom/server/provider-factory";
import { verifyRecorderToken } from "@/lib/classroom/server/recorder-token";
import { issueAgoraSignalingCredential } from "@/lib/classroom/signaling/agora-server";
import { classroomModePolicy } from "@/lib/classroom/mode";
import { prisma, withDatabaseReadRetry } from "@/lib/db";
import { databaseUnavailableResponse } from "@/lib/database-response";
import { CourseStatus } from "@/lib/course-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";

/** Renew an existing participant without join writes, snapshots or media jobs. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    sessionId?: unknown; clientId?: unknown; shareAccess?: unknown; recorderToken?: unknown;
  } | null;
  const referenceId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  if (!referenceId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  try {
    const recorder = typeof body?.recorderToken === "string" &&
      await verifyRecorderToken(body.recorderToken, referenceId);
    const resolved = recorder ? null : await resolveClassroomRequestAccess(
      request, referenceId, typeof body?.shareAccess === "string" ? body.shareAccess : null,
    );
    if (resolved && !resolved.ok) return NextResponse.json(
      { error: resolved.error, code: resolved.code }, { status: resolved.status },
    );
    const access = resolved?.ok ? resolved.access : null;
    const user = resolved?.ok ? resolved.session : null;
    const sessionId = access?.sessionId ?? referenceId;
    const lesson = await withDatabaseReadRetry(() => prisma.courseSession.findUnique({
      where: { id: sessionId },
      select: {
        courseId: true, roomUuid: true, roomType: true, status: true, classroomProvider: true,
        course: { select: { autoStudentOnStage: true } },
        classroomRuntime: { select: { status: true, assistantPermissions: true } },
        classroomMembers: {
          where: { userId: user?.userId ?? "" },
          select: { onStage: true, stageState: true, screenShareState: true }, take: 1,
        },
      },
    }));
    if (!lesson) return NextResponse.json({ error: "课堂不存在" }, { status: 404 });
    if (lesson.classroomRuntime?.status === "ended" ||
      lesson.status === CourseStatus.FINISHED || lesson.status === CourseStatus.CANCELLED) {
      return NextResponse.json({ error: "课堂已结束", code: "classroom_ended" }, { status: 409 });
    }
    const member = lesson.classroomMembers[0];
    if (!recorder && !member) return NextResponse.json({ error: "课堂成员不存在" }, { status: 404 });
    const role = recorder ? "student" : access!.role;
    const mode = classroomModePolicy(lesson.roomType, lesson.course.autoStudentOnStage);
    const userId = recorder ? `recorder-${lesson.courseId.replace(/-/g, "").slice(0, 40)}` : user!.userId;
    const acceptedStudent = role === "student" && member?.onStage && member.stageState === "accepted";
    const credential = getClassroomServerProvider(lesson.classroomProvider).issueCredential({
      clientId: normalizeClassroomClientId(body?.clientId), channelName: lesson.roomUuid,
      userId, role, scenario: mode.rtcScenario,
      publisher: !recorder && (role === "teacher" ||
        (role === "assistant" && mode.mode !== "largeClass") || Boolean(acceptedStudent)),
      allowScreenShare: !recorder && canShareClassroomScreen({ role, member,
        studentSharingSupported: mode.studentCanShareWhenOnStage,
        assistantManagementAllowed: (lesson.classroomRuntime?.assistantPermissions as Record<string, boolean> | undefined)?.[userId] === true }),
    });
    const clientId = normalizeClassroomClientId(body?.clientId);
    return NextResponse.json({ credential, signaling: recorder ? null : issueAgoraSignalingCredential(sessionId, clientId ? `${userId}:${clientId}` : userId) });
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    console.error("[classroom:credential] renewal failed", error);
    return NextResponse.json({ error: "Credential renewal failed" }, { status: 500 });
  }
}
