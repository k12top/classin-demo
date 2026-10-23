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
  confirmation?: "provider_exit" | "provider_resource_gone" | "synchronous_stop" | "never_dispatched";
  missingSince?: number;
  missingCount?: number;
  assetFingerprint?: string;
  assetStableSince?: number;
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
/** A single missing worker can be Agora failover, which can take 90 seconds. */
export const RECORDING_RESOURCE_GONE_WINDOW_MS = 90_000;
export function recordingUploadComplete(value: unknown): boolean {
  const response = recordingState(recordingState(value).serverResponse);
  if (response.uploadingStatus === "uploaded") return true;
  return Array.isArray(response.extensionServiceState) && response.extensionServiceState.some(service => {
    const entry = recordingState(service);
    return entry.serviceName === "upload_service" && recordingState(entry.payload).uploadingStatus === "uploaded";
  });
}
/** Do not confuse upload completion, a single component exit or status 6/7 with task exit. */
export function recordingProviderStatus(value: unknown): number | null {
  const status = recordingState(recordingState(value).serverResponse).status;
  return typeof status === "number" ? status : null;
}
export function recordingProviderExited(value: unknown): boolean {
  if (recordingState(value).queryVerified === false) return false;
  if ([8, 20].includes(recordingProviderStatus(value) ?? -1)) return true;
  const response = recordingState(recordingState(value).serverResponse);
  return recordingUploadComplete(value) && Array.isArray(response.extensionServiceState) &&
    response.extensionServiceState.some(service => {
      const entry = recordingState(service);
      return entry.serviceName === "web_recorder_service" && recordingState(entry.payload).state === "exit";
    });
}
export function recordingStopBackoff(attempt: number): number {
  return Math.min(300_000, 15_000 * 2 ** Math.min(5, Math.max(0, attempt - 1)));
}

/** Teacher-only operational evidence; never return credentials or raw provider payloads. */
export function recordingVerification(value: unknown) {
  const state = recordingState(value);
  const control = recordingStopControl(state);
  const query = recordingState(state.lastQuery);
  return {
    confirmedAt: control?.confirmedAt ?? null,
    confirmation: control?.confirmation ?? null,
    stopAttempts: control?.stopAttempts ?? 0,
    queryAttempts: control?.queryAttempts ?? 0,
    queryHttpStatus: typeof query.queryHttpStatus === "number" ? query.queryHttpStatus : null,
    providerStatus: recordingProviderStatus(query),
    uploadComplete: recordingUploadComplete(query) || recordingUploadComplete(state.lastStop),
    missingSince: control?.missingSince ?? null,
    missingCount: control?.missingCount ?? 0,
    assetStableSince: control?.assetStableSince ?? null,
    attention: control?.attention ?? null,
  };
}
