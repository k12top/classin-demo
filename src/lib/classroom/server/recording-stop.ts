import "server-only";
import { randomUUID } from "node:crypto";
import type { ClassroomRecording, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getRecordingProvider } from "./provider-factory";
import { newRecordingStopControl, recordingProviderExited, recordingProviderStatus,
  recordingState, recordingStopBackoff, recordingStopControl, recordingUploadComplete,
  RECORDING_RESOURCE_GONE_WINDOW_MS,
  RECORDING_QUERY_LIMIT, RECORDING_STOP_LEASE_MS, RECORDING_STOP_LIMIT,
  type RecordingStopControl } from "../recording-stop-state";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
async function locked<T>(id: string, fn: (tx: Prisma.TransactionClient, row: ClassroomRecording) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRecording" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.classroomRecording.findUnique({ where: { id } });
    return row ? fn(tx, row) : null;
  }, { timeout: 5_000 });
}

/** Idempotent queueing never clears another worker's lease/backoff or retry budget. */
export async function queueDurableRecordingStop(id: string, retryVerification = false) {
  await locked(id, async (tx, row) => {
    const existing = recordingStopControl(row.providerState);
    if (existing?.confirmedAt || (row.status === "completed" && !row.stopRequestedAt)) return;
    if (existing && row.stopRequestedAt && !retryVerification) return;
    const control = existing ?? newRecordingStopControl(row.stopRetryCount);
    // Only an explicitly authorized teacher stop request can re-arm an exhausted
    // budget. Automated cron/GET paths never reset it.
    if (retryVerification && control.attention && row.resourceId && row.providerSessionId) {
      control.attention = undefined; control.queryAttempts = 0; control.stopAttempts = 0;
      control.nextAction = "query"; control.nextAt = 0;
    }
    if (!existing && ["processing", "completed"].includes(row.status)) control.nextAction = "query";
    await tx.classroomRecording.update({ where: { id }, data: {
      status: control.attention ? "processing" : "stopping",
      stopRequestedAt: row.stopRequestedAt ?? new Date(),
      // Legacy stoppedAt represented a request or a discovered file, not confirmed exit.
      stoppedAt: null,
      providerState: json({ ...recordingState(row.providerState), stopControl: control }),
    } });
  });
  return prisma.classroomRecording.findUniqueOrThrow({ where: { id } });
}

/** One external operation per call, with a durable fenced lease and finite budgets. */
export async function reconcileDurableRecordingStop(id: string) {
  const now = Date.now();
  const claim = await locked(id, async (tx, row) => {
    const state = recordingState(row.providerState);
    const control = recordingStopControl(state) ?? newRecordingStopControl(row.stopRetryCount);
    if (control.attention || control.nextAt > now || (control.leaseUntil ?? 0) > now) return null;
    if (control.confirmedAt && row.playbackObjectKey) {
      await tx.classroomRecording.update({ where: { id }, data: { status: "completed", stoppedAt: new Date(control.confirmedAt) } });
      return null;
    }
    // A crash during the previous operation consumed its reserved attempt. Verify before retrying stop.
    if (control.leaseId) control.nextAction = "query";
    const hasIdentity = Boolean(row.resourceId && row.providerSessionId && row.recorderUserId !== "pending");
    if (!hasIdentity) {
      if (state.startDispatch === "not_dispatched") {
        control.confirmedAt = new Date(now).toISOString();
        control.confirmation = "never_dispatched";
        await tx.classroomRecording.update({ where: { id }, data: { status: "completed", stoppedAt: new Date(now),
          providerState: json({ ...state, stopControl: control }), failureStage: null, errorMessage: null } });
        return null;
      }
      // An in-flight start will persist its SID and release this condition. Never invent successful stop.
      control.attention = "Provider task identity is unknown; verify the startup result before retrying";
    } else if ((control.nextAction === "stop" && control.stopAttempts >= RECORDING_STOP_LIMIT) || control.confirmedAt) {
      control.nextAction = "query";
    }
    if (control.nextAction === "query" && control.queryAttempts >= RECORDING_QUERY_LIMIT) {
      control.attention = control.confirmedAt ? "Recorder exited but replay is still unavailable" : "Recorder exit remains unconfirmed after bounded verification";
    }
    if (control.attention) {
      await tx.classroomRecording.update({ where: { id }, data: { status: "processing", failureStage: "stop-attention",
        stoppedAt: control.confirmedAt ? new Date(control.confirmedAt) : null,
        errorMessage: control.attention, providerState: json({ ...state, stopControl: control }) } });
      console.error("[classroom:recording] operator attention required", { recordingId: id, reason: control.attention });
      return null;
    }
    const operation = control.nextAction;
    control[operation === "stop" ? "stopAttempts" : "queryAttempts"] += 1;
    control.leaseId = randomUUID(); control.leaseUntil = now + RECORDING_STOP_LEASE_MS;
    await tx.classroomRecording.update({ where: { id }, data: { status: "processing",
      stopRequestedAt: row.stopRequestedAt ?? new Date(now), lastProviderCheckAt: new Date(now),
      stoppedAt: control.confirmedAt ? new Date(control.confirmedAt) : null,
      providerState: json({ ...state, stopControl: control }) } });
    return { row, control, operation };
  });
  if (!claim) return prisma.classroomRecording.findUnique({ where: { id } });
  const { row, control, operation } = claim;
  const provider = getRecordingProvider(row.provider);
  let result: Awaited<ReturnType<typeof provider.query>> | Awaited<ReturnType<typeof provider.stop>> | null = null;
  let failure: string | null = null;
  try {
    result = await provider[operation]({ channelName: row.channelName, recorderUserId: row.recorderUserId,
      resourceId: row.resourceId!, providerSessionId: row.providerSessionId!, providerState: recordingState(row.providerState) });
  } catch (error) { failure = error instanceof Error ? error.message.slice(0, 1000) : "Provider operation failed"; }
  await locked(id, async (tx, current) => {
    const currentState = recordingState(current.providerState);
    const latest = recordingStopControl(currentState);
    if (!latest || latest.leaseId !== control.leaseId) return; // stale worker cannot overwrite a later claim/webhook.
    const completedAt = new Date();
    const next: RecordingStopControl = { ...latest, leaseId: undefined, leaseUntil: undefined,
      nextAction: "query", nextAt: completedAt.getTime() + recordingStopBackoff(Math.max(latest.stopAttempts, latest.queryAttempts)) };
    const objectKey = result?.playbackObjectKey || current.playbackObjectKey;
    const evidence = recordingState(result?.providerState);
    const sameTask = (value: unknown) => {
      const response = recordingState(value);
      return response.sid === row.providerSessionId && response.resourceId === row.resourceId &&
        (response.code === undefined || response.code === 0);
    };
    const acceptedStop = sameTask(currentState.lastStop) ||
      (operation === "stop" && evidence.stopVerified === true && sameTask(evidence));
    const synchronousStop = operation === "stop" && evidence.stopVerified === true && sameTask(evidence) && evidence.stopSynchronous === true &&
      recordingUploadComplete(evidence);
    const exited = Boolean(result && ((operation === "query" && recordingProviderExited(evidence)) || synchronousStop));
    if (exited) { next.confirmedAt ??= completedAt.toISOString(); next.confirmation = "provider_exit"; }
    if (synchronousStop) next.confirmation = "synchronous_stop";
    if (operation === "query") {
      const time = completedAt.getTime();
      if (typeof evidence.storageFingerprint === "string") {
        if (next.assetFingerprint !== evidence.storageFingerprint) next.assetStableSince = time;
        next.assetFingerprint = evidence.storageFingerprint;
      } else {
        next.assetFingerprint = undefined; next.assetStableSince = undefined;
      }
      if (evidence.queryNotFound === true && evidence.queryHttpStatus === 404 && evidence.code === 404) {
        next.missingSince ??= time; next.missingCount = (next.missingCount ?? 0) + 1;
        const knownTask = recordingState(currentState.started).sid === row.providerSessionId &&
          recordingState(currentState.acquire).resourceId === row.resourceId;
        // Query is only valid while a task exists. After an accepted same-SID
        // stop, sustained absence beyond failover + a stable complete OSS listing
        // proves exit without requiring a terminal query response that may never exist.
        if (acceptedStop && knownTask && row.stopRequestedAt && objectKey &&
          time - row.stopRequestedAt.getTime() >= RECORDING_RESOURCE_GONE_WINDOW_MS &&
          time - next.missingSince >= RECORDING_RESOURCE_GONE_WINDOW_MS &&
          (next.missingCount ?? 0) >= 2 && next.assetStableSince !== undefined &&
          time - next.assetStableSince >= RECORDING_RESOURCE_GONE_WINDOW_MS) {
          next.confirmedAt ??= completedAt.toISOString(); next.confirmation = "provider_resource_gone";
        }
      } else {
        next.missingSince = undefined; next.missingCount = undefined;
      }
    }
    if (!next.confirmedAt && operation === "query" && result) {
      const status = recordingProviderStatus(result.providerState);
      // Retry the same task only when the provider positively reports it is still live/starting.
      if (status !== null && status >= 0 && status <= 5 && next.stopAttempts < RECORDING_STOP_LIMIT) next.nextAction = "stop";
    }
    const completed = Boolean(next.confirmedAt && objectKey);
    await tx.classroomRecording.update({ where: { id }, data: {
      status: completed ? "completed" : "processing",
      providerState: json({ ...currentState, ...(result ? { [operation === "stop" ? "lastStop" : "lastQuery"]: result.providerState } : {}), stopControl: next }),
      ...(result?.files.length ? { files: json(result.files) } : {}),
      playbackObjectKey: objectKey, playbackFormat: result?.playbackFormat || current.playbackFormat,
      stoppedAt: next.confirmedAt ? new Date(next.confirmedAt) : null,
      stopRetryCount: next.stopAttempts,
      lastProviderCheckAt: completedAt,
      failureStage: failure ? "stop-verification" : null,
      errorMessage: completed ? null : failure || (next.confirmedAt ? "Recorder exit confirmed; waiting for replay" : "Stop requested; recorder exit is not confirmed"),
    } });
  });
  return prisma.classroomRecording.findUnique({ where: { id } });
}
