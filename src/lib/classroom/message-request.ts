import type { ClassroomMessageSnapshot } from "./types";

export type ClassroomMessageRequest = {
  clientMessageId: string;
  content: string;
  scope: "classroom" | "room" | "staff" | "direct";
  spaceId?: string | null;
  recipientId?: string | null;
  shareAccess?: string;
};

export type ClassroomMessageResponse = {
  error?: string;
  code?: string;
  message?: ClassroomMessageSnapshot;
  revision?: number;
};

async function retryWait(milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Every attempt has the same server-side idempotency key, including lost replies. */
export async function requestClassroomMessage(
  url: string,
  body: ClassroomMessageRequest,
  fetcher: typeof fetch = fetch,
  wait: (milliseconds: number, signal?: AbortSignal) => Promise<void> = retryWait,
  signal?: AbortSignal,
) {
  const serialized = JSON.stringify(body);
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      const response = await fetcher(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: serialized,
        signal: AbortSignal.any([AbortSignal.timeout(6_000), ...(signal ? [signal] : [])]),
      });
      const payload = await response.json().catch(() => ({})) as ClassroomMessageResponse;
      const retryable = [408, 500, 502, 503, 504].includes(response.status) || (response.ok && !payload.message);
      if (retryable && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        await wait(Math.max(300 * (attempt + 1), Math.min(2_000, Number.isFinite(retryAfter) ? retryAfter * 1_000 : 0)), signal);
        continue;
      }
      return { response, payload };
    } catch (error) {
      signal?.throwIfAborted();
      if (attempt >= 2) throw error;
      await wait(300 * (attempt + 1), signal);
    }
  }
}
