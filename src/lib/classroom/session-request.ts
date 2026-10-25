import { ClassroomRecoveryError, retryClassroomRecovery } from "./credential-recovery";
import { withClassroomRequestSignal } from "./request-signal";

type SessionFailure = { error?: string; code?: string; courseId?: string; devices?: string[] };

export class ClassroomSessionRequestError extends ClassroomRecoveryError {
  constructor(status: number, retryAfterMs: number, public readonly payload: SessionFailure) {
    super(status, retryAfterMs);
  }
}

/** Retry the same tab's idempotent bootstrap; permission failures stay terminal. */
export async function requestClassroomSession<T extends { credential: unknown }>(options: {
  signal: AbortSignal;
  request: (signal: AbortSignal) => Promise<Response>;
  refreshAuth?: () => Promise<boolean>;
  onResponse?: (status: number, payload: unknown) => void;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  wait?: (delay: number, signal: AbortSignal) => Promise<void>;
}): Promise<T> {
  let refreshedAuth = false;
  return retryClassroomRecovery(() => withClassroomRequestSignal(10_000, options.signal, async (signal) => {
    let response = await options.request(signal);
    if (response.status === 401 && !refreshedAuth && options.refreshAuth) {
      refreshedAuth = true;
      if (await options.refreshAuth()) {
        options.signal.throwIfAborted();
        response = await options.request(signal);
      }
    }
    const raw: unknown = await response.json().catch(() => ({}));
    const payload = (raw && typeof raw === "object" ? raw : {}) as SessionFailure & Partial<T>;
    options.signal.throwIfAborted();
    options.onResponse?.(response.status, payload);
    if (!response.ok || !payload.credential || typeof payload.credential !== "object") {
      throw new ClassroomSessionRequestError(response.ok ? 502 : response.status,
        Number(response.headers.get("Retry-After") || 0) * 1_000, payload);
    }
    return payload as T;
  }), { signal: options.signal, maxAttempts: 4, jitter: true, onFailure: options.onRetry, wait: options.wait });
}
