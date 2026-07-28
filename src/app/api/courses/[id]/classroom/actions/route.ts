import { NextRequest, NextResponse } from "next/server";
import type { ClassroomAction } from "@/lib/classroom/types";
import {
  applyClassroomAction,
  ClassroomActionError,
  ClassroomRevisionConflictError,
  getClassroomRuntimeSnapshot,
} from "@/lib/classroom/server/runtime";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import {
  startRecordingForCourse,
  stopActiveRecordingsForCourse,
} from "@/lib/classroom/server/recording-orchestrator";
import {
  stopClassroomTranscription,
  syncClassroomTranscription,
} from "@/lib/classroom/server/transcription-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTION_TYPES = new Set<ClassroomAction["type"]>([
  "heartbeat",
  "startClass",
  "endClass",
  "raiseHand",
  "lowerHand",
  "inviteStage",
  "acceptStage",
  "declineStage",
  "removeStage",
  "setMemberMuted",
  "setMediaAllowed",
  "muteAll",
  "setWhiteboardWritable",
  "setSpotlight",
  "setStage",
  "setChatEnabled",
  "setInterpretation",
  "startTimer",
  "resetTimer",
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
  const resolved = await resolveClassroomRequestAccess(
    request,
    courseId,
    shareAccess,
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }

  try {
    let runtimeSnapshot = await applyClassroomAction({
      courseId,
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
      await startRecordingForCourse(courseId).catch((error) => {
        console.error("[classroom:actions] auto recording failed", {
          courseId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      await syncClassroomTranscription(courseId).catch((error) => {
        console.error("[classroom:actions] auto transcription failed", {
          courseId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      runtimeSnapshot = await getClassroomRuntimeSnapshot(courseId);
    }
    if (
      body.action.type === "endClass" &&
      resolved.access.role === "teacher"
    ) {
      await stopActiveRecordingsForCourse(courseId).catch((error) => {
        console.error("[classroom:actions] stop recording failed", {
          courseId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      await stopClassroomTranscription(courseId).catch((error) => {
        console.error("[classroom:actions] stop transcription failed", {
          courseId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      runtimeSnapshot = await getClassroomRuntimeSnapshot(courseId);
    }
    if (
      body.action.type === "setInterpretation" &&
      resolved.access.role === "teacher"
    ) {
      await syncClassroomTranscription(courseId, { restart: true }).catch((error) => {
        console.error("[classroom:actions] transcription settings failed", {
          courseId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      runtimeSnapshot = await getClassroomRuntimeSnapshot(courseId);
    }
    return NextResponse.json({ runtime: runtimeSnapshot });
  } catch (error) {
    if (error instanceof ClassroomRevisionConflictError) {
      return NextResponse.json(
        {
          error: "课堂状态已更新，请重试",
          runtime: await getClassroomRuntimeSnapshot(courseId),
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
