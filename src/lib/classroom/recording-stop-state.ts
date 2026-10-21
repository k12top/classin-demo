/** Durable metadata in the existing recording JSON; no schema migration. */
export type RecordingStopControl = {
  version: 1;
  stopAttempts: number;
  queryAttempts: number;
  nextAction: "stop" | "query";
  nextAt: number;
  leaseId?: string;
  leaseUntil?: number;
  confirmedAt?: string;
  confirmation?: "provider_exit" | "never_dispatched";
  attention?: string;
};
export const RECORDING_STOP_LIMIT = 6;
export const RECORDING_QUERY_LIMIT = 24;
export const RECORDING_STOP_LEASE_MS = 90_000;
export function recordingState(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
export function recordingStopControl(value: unknown): RecordingStopControl | null {
  const state = recordingState(recordingState(value).stopControl);
  return state.version === 1 ? state as RecordingStopControl : null;
}
export function newRecordingStopControl(previousFailures = 0): RecordingStopControl {
  return { version: 1, stopAttempts: Math.min(RECORDING_STOP_LIMIT, previousFailures),
    queryAttempts: 0, nextAction: previousFailures ? "query" : "stop", nextAt: 0 };
}
/** Only explicit task exit is terminal. HTTP success, files, 404 and status 6/7 aren't exit. */
export function recordingProviderStatus(value: unknown): number | null {
  const status = recordingState(recordingState(value).serverResponse).status;
  return typeof status === "number" ? status : null;
}
export function recordingProviderExited(value: unknown): boolean {
  if (recordingState(value).queryVerified === false) return false;
  return [8, 20].includes(recordingProviderStatus(value) ?? -1);
}
export function recordingStopBackoff(attempt: number): number {
  return Math.min(300_000, 15_000 * 2 ** Math.min(5, Math.max(0, attempt - 1)));
}
