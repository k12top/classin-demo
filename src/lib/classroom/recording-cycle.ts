import { shouldRecoverRecording, type RecordingRecoveryCandidate } from "./recording-continuity";

type CycleRecording = RecordingRecoveryCandidate & { createdAt: Date; providerState?: unknown };
export function recordingIsFromPreviousCycle(recording: Pick<CycleRecording, "createdAt">, startedAt: Date | null | undefined) {
  return Boolean(startedAt && recording.createdAt < startedAt);
}
/** A manual stop stays stopped within a cycle. Reopening requests a fresh segment. */
export function automaticRecordingNeeded(recording: CycleRecording | null | undefined, startedAt: Date | null | undefined, maxRetries: number) {
  if (!recording) return true;
  if (recording.failureStage === "start-unknown") return false;
  if (recordingIsFromPreviousCycle(recording, startedAt)) return true;
  const state = recording.providerState && typeof recording.providerState === "object" ? recording.providerState as Record<string, unknown> : {};
  if (state.continuityReason === "duration_rollover" && recording.status === "completed") return true;
  return shouldRecoverRecording(recording, maxRetries);
}
export function recordingRotationDue(recording: CycleRecording, maxHours: number, now = Date.now()) {
  return recording.status === "recording" && !recording.stopRequestedAt &&
    now - recording.createdAt.getTime() >= Math.max(15 * 60_000, maxHours * 3_600_000 - 5 * 60_000);
}
