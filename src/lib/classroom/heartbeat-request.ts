import { ClassroomRecoveryError, retryClassroomRecovery } from "./credential-recovery";

/** A successful HTTP response must also confirm that the lease was updated. */
export async function requestClassroomHeartbeat(options: {
  signal: AbortSignal;
  request: (signal: AbortSignal) => Promise<Response>;
  onResponse?: (status: number, payload: Record<string, unknown>) => boolean;
  wait?: (delay: number, signal: AbortSignal) => Promise<void>;
}) {
  return retryClassroomRecovery(async () => {
    const response = await options.request(AbortSignal.any([options.signal, AbortSignal.timeout(8_000)]));
    const payload = await response.json() as Record<string, unknown>;
    options.signal.throwIfAborted();
    if (options.onResponse?.(response.status, payload)) return false;
    if (!response.ok || payload.refreshed === false) throw new ClassroomRecoveryError(
      response.ok ? 503 : response.status, Number(response.headers.get("Retry-After") || 0) * 1_000,
    );
    return true;
  }, { signal: options.signal, maxAttempts: 2, jitter: true, wait: options.wait });
}

export function classroomPollDelay(baseMs: number, failures: number, hidden = false) {
  return Math.min(30_000, Math.max(hidden ? 30_000 : baseMs, baseMs * 2 ** Math.min(failures, 4)));
}
