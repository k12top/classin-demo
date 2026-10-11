/** Cloud recording and embedded browsers may lack AbortSignal.any/timeout. */
export async function withClassroomRequestSignal<T>(
  timeoutMs: number,
  parent: AbortSignal | undefined,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason ?? new DOMException("Request canceled", "AbortError"));
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}
