import { after, NextRequest, NextResponse } from "next/server";
import type { ClassroomAction } from "@/lib/classroom/types";
import {
  applyClassroomAction,
  ClassroomActionError,
  ClassroomRevisionConflictError,
  getClassroomEngagementSnapshot,
  getClassroomRuntimeSnapshot,
} from "@/lib/classroom/server/runtime";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import {
  processRecordingStart,
  requestRecordingStart,
} from "@/lib/classroom/server/recording-orchestrator";
import { syncClassroomTranscription } from "@/lib/classroom/server/transcription-orchestrator";
import { databaseUnavailableResponse } from "@/lib/database-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTION_TYPES = new Set<ClassroomAction["type"]>([
  "heartbeat",
  "startClass",
  "raiseHand",
  "lowerHand",
  "inviteStage",
  "acceptStage",
  "declineStage",
  "removeStage",
  "requestScreenShare",
  "acceptScreenShare",
  "declineScreenShare",
  "stopScreenShare",
  "setMemberMuted",
  "setMediaAllowed",
  "muteAll",
  "setWhiteboardWritable",
  "setSpotlight",
  "reorderSeats",
  "placeBoardItem",
  "updateBoardItem",
  "removeBoardItem",
  "bringBoardItemToFront",
  "resetComposition",
  "arrangeVideoGallery",
  "swapSeats",
  "authorizeAllOnStage",
  "deauthorizeAll",
  "removeAllStudentsFromStage",
  "muteAllMicrophones",
  "setStage",
  "setChatEnabled",
  "setInterpretation",
  "startTimer",
  "pauseTimer",
  "resumeTimer",
  "resetTimer",
  "giveReward",
  "startBuzz",
  "submitBuzz",
  "closeBuzz",
  "startRandomSelector",
  "resetRandomSelector",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    action?: ClassroomAction;
    expectedRevision?: unknown;
    shareAccess?: unknown;
  } | null;
  if (
    !body?.action ||
    typeof body.action !== "object" ||
    !ACTION_TYPES.has(body.action.type)
  ) {
    return NextResponse.json({ error: "课堂操作无效" }, { status: 400 });
  }
  const shareAccess =
    typeof body.shareAccess === "string" ? body.shareAccess : "";
  let resolved;
  try {
    resolved = await resolveClassroomRequestAccess(
      request,
      courseId,
      shareAccess,
    );
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    throw error;
  }
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }

  try {
    const resolvedCourseId = resolved.access.courseId;
    const sessionId = resolved.access.sessionId;
    let runtimeSnapshot = await applyClassroomAction({
      courseId: resolvedCourseId,
      sessionId,
      session: resolved.session,
      role: resolved.access.role,
      expectedRevision:
        typeof body.expectedRevision === "number"
          ? body.expectedRevision
          : undefined,
      action: body.action,
    });
    if (
      body.action.type === "startClass" &&
      resolved.access.role === "teacher"
    ) {
      const recording = await requestRecordingStart(
        resolvedCourseId,
        sessionId,
      ).catch((error) => {
        console.error("[classroom:actions] auto recording failed", {
          courseId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (recording) {
        after(() => processRecordingStart(recording.id).catch((error) => {
          console.error("[classroom:actions] auto recording failed", {
            courseId,
            recordingId: recording.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }));
      }
      after(() => syncClassroomTranscription(resolvedCourseId, { sessionId }).catch((error) => {
          console.error("[classroom:actions] auto transcription failed", {
            courseId,
            error: error instanceof Error ? error.message : String(error),
          });
        }));
      runtimeSnapshot = await getClassroomRuntimeSnapshot(
        resolvedCourseId,
        sessionId,
        { ensure: false },
      );
    }
    if (
      body.action.type === "setInterpretation" &&
      resolved.access.role === "teacher"
    ) {
      await syncClassroomTranscription(resolvedCourseId, { restart: true, sessionId }).catch((error) => {
        console.error("[classroom:actions] transcription settings failed", {
          courseId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      runtimeSnapshot = await getClassroomRuntimeSnapshot(
        resolvedCourseId,
        sessionId,
        { ensure: false },
      );
    }
    return NextResponse.json({
      runtime: runtimeSnapshot,
      engagement: await getClassroomEngagementSnapshot(sessionId),
    });
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;
    if (error instanceof ClassroomRevisionConflictError) {
      return NextResponse.json(
        {
          error: "课堂状态已更新，请重试",
          runtime: await getClassroomRuntimeSnapshot(
            resolved.access.courseId,
            resolved.access.sessionId,
          ),
          engagement: await getClassroomEngagementSnapshot(
            resolved.access.sessionId,
          ),
        },
        { status: 409 },
      );
    }
    if (error instanceof ClassroomActionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("[classroom:actions] failed", error);
    return NextResponse.json({ error: "课堂操作失败" }, { status: 500 });
  }
}
