import { normalizeClassroomClientId, touchClassroomConnection } from "@/lib/classroom/server/connections";
import { after, NextRequest, NextResponse } from "next/server";
import { classroomRedisEnabled } from "@/lib/classroom/server/redis";
import { getSessionFromRequest } from "@/lib/session";
import { redisClassroomHeartbeat, type RedisHeartbeat } from "@/lib/classroom/server/redis-presence";
import { flushClassroomRedisPresence, synchronizeClassroomRedis } from "@/lib/classroom/server/redis-sync";
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
  ensureClassroomTranscriptionForLiveSession,
  syncClassroomTranscription,
} from "@/lib/classroom/server/transcription-orchestrator";
import { deliverClassroomEvents } from "@/lib/classroom/server/integration-events";
import { prisma, databasePoolSnapshot } from "@/lib/db";
import { requestRecordingStop, processRecordingStop } from "@/lib/classroom/server/recording-orchestrator";
import { databaseUnavailableResponse } from "@/lib/database-response";
import { isMicrophonePermissionAction } from "@/lib/classroom/member-permissions";
import { applyClassroomMemberPermissions } from "@/lib/classroom/server/member-permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";

const ACTION_TYPES = new Set<ClassroomAction["type"]>([
  "heartbeat",
  "setAssistantPermission",
  "startClass",
  "setRecordingStartMode",
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
  "startScreenShare",
  "releaseScreenShare",
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
  "unmuteAllMicrophones",
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

const transcriptionHeartbeatChecks = new Map<string, number>();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = performance.now();
  const { id: courseId } = await params;
  const body = (await request.json().catch(() => null)) as {
    clientId?: unknown;
    action?: ClassroomAction;
    expectedRevision?: unknown;
    shareAccess?: unknown;
    presenceOnly?: unknown;
    compactMemberPermissions?: unknown;
  } | null;
  if (
    !body?.action ||
    typeof body.action !== "object" ||
    !ACTION_TYPES.has(body.action.type)
  ) {
    return NextResponse.json({ error: "课堂操作无效" }, { status: 400 });
  }
  // Cookie/JWT identity plus a PG-registered Redis lease authorizes only presence,
  // never admission, reads, publishing or moderation. Expired control falls back to PG.
  const heartbeatClientId = normalizeClassroomClientId(body.clientId);
  if (classroomRedisEnabled() && body.action.type === "heartbeat" && body.presenceOnly === true && heartbeatClientId) {
    const identity = await getSessionFromRequest(request);
    if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const cached = await redisClassroomHeartbeat(courseId, identity.userId, heartbeatClientId);
    if (cached) {
      scheduleRedisHeartbeatWork(courseId, cached);
      if (cached.status === "ended") return NextResponse.json({ code: "classroom_ended", error: "课堂已结束" }, { status: 409 });
      if (!cached.refreshed) return NextResponse.json({ code: "classroom_connection_closed", refreshed: false }, { status: 409 });
      return NextResponse.json({ ok: true, status: cached.status, refreshed: true });
    }
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
    const unavailable = databaseUnavailableResponse(error, { route: "classroom/actions", sessionId: courseId, operation: body.action.type, clientId: normalizeClassroomClientId(body.clientId), durationMs: Math.round(performance.now() - startedAt) });
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
    const clientId = normalizeClassroomClientId(body.clientId);
    // Already-open older clients still expect the full runtime response.
    if (body.compactMemberPermissions === true && isMicrophonePermissionAction(body.action)) {
      const memberPermissions = await applyClassroomMemberPermissions({
        courseId: resolvedCourseId, sessionId, actorId: resolved.session.userId,
        role: resolved.access.role, action: body.action,
      });
      await synchronizeClassroomRedis(sessionId, true);
      return NextResponse.json({ memberPermissions });
    }
    const heartbeatStartedAt = performance.now();
    const heartbeatResult = clientId && body.action.type === "heartbeat"
      ? await touchClassroomConnection(sessionId, resolved.session.userId, clientId) : null;
    if (clientId && body.action.type === "heartbeat" && body.presenceOnly === true) {
      const durationMs = Math.round(performance.now() - heartbeatStartedAt);
      if (durationMs >= 500 || !heartbeatResult?.refreshed) console.warn("[classroom:heartbeat]", {
        sessionId, userId: resolved.session.userId, clientId, refreshed: heartbeatResult?.refreshed ?? false,
        reason: heartbeatResult?.reason, status: heartbeatResult?.status, durationMs, pool: databasePoolSnapshot(),
      });
      if (!heartbeatResult || heartbeatResult.status === "missing") return NextResponse.json({ error: "课堂不存在" }, { status: 404 });
      if (heartbeatResult.status === "ended") {
        return NextResponse.json({ error: "课堂已结束", code: "classroom_ended" }, { status: 409 });
      }
      if (!heartbeatResult.refreshed) return NextResponse.json({
        code: heartbeatResult.reason === "busy" ? "heartbeat_busy" : "classroom_connection_closed",
        retryable: heartbeatResult.reason === "busy", refreshed: false,
      }, { status: heartbeatResult.reason === "busy" ? 503 : 409, headers: { "Retry-After": "2" } });
      if (heartbeatResult.status === "live" && resolved.access.role === "teacher") {
        const now = Date.now();
        if (now - (transcriptionHeartbeatChecks.get(sessionId) ?? 0) >= 60_000) {
          if (transcriptionHeartbeatChecks.size >= 500) {
            for (const [id, checkedAt] of transcriptionHeartbeatChecks) if (now - checkedAt >= 60_000) transcriptionHeartbeatChecks.delete(id);
          }
          transcriptionHeartbeatChecks.set(sessionId, now);
          after(() => ensureClassroomTranscriptionForLiveSession(resolvedCourseId, sessionId).catch((error) => {
            console.warn("[classroom:heartbeat] transcription recovery failed", error);
          }));
        }
      }
      if ("syncDue" in heartbeatResult && heartbeatResult.syncDue) after(() => flushClassroomRedisPresence(sessionId));
      return NextResponse.json({ ok: true, status: heartbeatResult.status, refreshed: true });
    }
    const runtimeSnapshot = await applyClassroomAction({
      courseId: resolvedCourseId,
      sessionId,
      session: resolved.session,
      role: resolved.access.role,
      clientId,
      expectedRevision:
        typeof body.expectedRevision === "number"
          ? body.expectedRevision
          : undefined,
      action: body.action,
    });
    if (body.action.type === "startClass") after(() => deliverClassroomEvents());
    if (body.action.type === "setRecordingStartMode" && body.action.mode === "disabled") {
      const recordings = await prisma.classroomRecording.findMany({
        where: { sessionId, status: { in: ["starting", "recording", "stopping"] } },
      });
      const stopping = await Promise.all(recordings.map(requestRecordingStop));
      after(async () => {
        await Promise.all(stopping.map((recording) => processRecordingStop(recording.id).catch((error) => {
          console.error("[classroom:actions] disable recording stop failed", { sessionId, recordingId: recording.id, error: error instanceof Error ? error.message : String(error) });
        })));
      });
    }
    if (
      (body.action.type === "startClass" ||
        (body.action.type === "heartbeat" && runtimeSnapshot.status === "live") ||
        (body.action.type === "setRecordingStartMode" && runtimeSnapshot.status === "live")) &&
      resolved.access.role === "teacher"
    ) {
      after(() =>
        ensureClassroomTranscriptionForLiveSession(
          resolvedCourseId,
          sessionId,
        ).catch((error) => {
          console.error("[classroom:actions] auto transcription failed", {
            courseId,
            error: error instanceof Error ? error.message : String(error),
          });
        }),
      );
    }
    if (
      body.action.type === "setInterpretation" &&
      resolved.access.role === "teacher"
    ) {
      after(() => syncClassroomTranscription(resolvedCourseId, { restart: true, sessionId }).catch((error) => {
        console.error("[classroom:actions] transcription settings failed", {
          courseId,
          error: error instanceof Error ? error.message : String(error),
        });
      }));
    }
    return NextResponse.json({
      runtime: runtimeSnapshot,
      ...(body.action.type !== "heartbeat" && { engagement: await getClassroomEngagementSnapshot(sessionId) }),
    });
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error, { route: "classroom/actions", sessionId: resolved.access.sessionId, userId: resolved.session.userId, operation: body.action.type, clientId: normalizeClassroomClientId(body.clientId), durationMs: Math.round(performance.now() - startedAt) });
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

function scheduleRedisHeartbeatWork(sessionId: string, heartbeat: RedisHeartbeat) {
  if (heartbeat.syncDue) after(() => flushClassroomRedisPresence(sessionId));
  if (heartbeat.refreshed && heartbeat.status === "live" && heartbeat.role === "teacher" &&
      Date.now() - (transcriptionHeartbeatChecks.get(sessionId) ?? 0) >= 60_000) {
    transcriptionHeartbeatChecks.set(sessionId, Date.now());
    after(() => ensureClassroomTranscriptionForLiveSession(heartbeat.courseId, sessionId).catch(() => {
      console.warn("[classroom:heartbeat] transcription recovery pending", { sessionId });
    }));
  }
}
