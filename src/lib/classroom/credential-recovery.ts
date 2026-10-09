export class ClassroomRecoveryError extends Error {
  constructor(public readonly status: number, public readonly retryAfterMs = 0) {
    super(`Classroom credential request failed (${status})`);
    this.name = "ClassroomRecoveryError";
  }
}

export function canRetryClassroomRecovery(error: unknown): boolean {
  if (error instanceof ClassroomRecoveryError) return error.status === 408 || error.status === 429 || error.status >= 500;
  if (error instanceof RangeError) return false;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["INVALID_TOKEN", "INVALID_UID", "UID_CONFLICT", "UID_BANNED", "CHANNEL_BANNED"].includes(code)) return false;
  return !(error instanceof DOMException && error.name === "AbortError");
}

function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, delay);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

/** One caller owns the retry loop; leaving the lesson aborts waits and requests. */
export async function retryClassroomRecovery<T>(operation: () => Promise<T>, options: {
  signal: AbortSignal;
  onFailure?: (error: unknown, attempt: number, delayMs: number) => void;
  wait?: (delay: number, signal: AbortSignal) => Promise<void>;
}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    options.signal.throwIfAborted();
    try {
      const result = await operation();
      options.signal.throwIfAborted();
      return result;
    }
    catch (error) {
      options.signal.throwIfAborted();
      if (!canRetryClassroomRecovery(error)) throw error;
      const retryAfter = error instanceof ClassroomRecoveryError && Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 0;
      const delay = Math.min(30_000, Math.max(
        1_000 * 2 ** Math.min(attempt, 5),
        retryAfter,
      ));
      options.onFailure?.(error, attempt + 1, delay);
      await (options.wait ?? waitForRetry)(delay, options.signal);
    }
  }
}
