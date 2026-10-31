import { ClassroomRecoveryError, retryClassroomRecovery } from "./credential-recovery";
import { withClassroomRequestSignal } from "./request-signal";
import type { ClassroomRuntimeSnapshot } from "./types";

/** Navigation waits for a durable end acknowledgment; retries keep the same cycle. */
export function requestClassroomEnd(options: {
  signal: AbortSignal;
  request: (signal: AbortSignal) => Promise<Response>;
  wait?: (delay: number, signal: AbortSignal) => Promise<void>;
}) {
  return retryClassroomRecovery(() => withClassroomRequestSignal(10_000, options.signal, async signal => {
    const response = await options.request(signal);
    const payload = await response.json().catch(() => null) as {
      error?: string; session?: { status?: string }; runtime?: ClassroomRuntimeSnapshot;
    } | null;
    if (!response.ok || !["afterClass", "finished"].includes(payload?.session?.status || "") ||
      (payload?.runtime && payload.runtime.status !== "ended")) {
      const error = new ClassroomRecoveryError(response.ok ? 503 : response.status,
        Number(response.headers.get("Retry-After") || 0) * 1_000);
      error.message = payload?.error || "Class end was not confirmed; please retry";
      throw error;
    }
    return { ...payload!, session: { ...payload!.session!, status: payload!.session!.status! } };
  }), { signal: options.signal, maxAttempts: 2, jitter: true, wait: options.wait });
}
