import { tryOAuthRefresh } from "../auth-refresh-client";
import { createCaptionOutbox, captionOutboxSessions, captionContains } from "./caption-outbox";
import { createCaptionPersistenceQueue } from "./caption-persistence";
import { withClassroomRequestSignal } from "./request-signal";
import type { ClassroomCaptionInput, ClassroomCaptionSnapshot } from "./types";

export async function deliverClassroomCaption(
  sessionId: string,
  caption: ClassroomCaptionInput,
  options: { recorderToken?: string; shareAccess?: string; signal?: AbortSignal } = {},
): Promise<{ caption: ClassroomCaptionSnapshot; revision?: number }> {
  return withClassroomRequestSignal(15_000, options.signal, async signal => {
    const send = () => fetch(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/captions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", signal,
      // Requests can survive a route transition. Oversized provider messages
      // still use ordinary fetch; their durable copy survives page teardown.
      keepalive: new TextEncoder().encode(JSON.stringify(caption)).length < 48_000,
      body: JSON.stringify({ caption,
        ...(options.shareAccess && { shareAccess: options.shareAccess }),
        ...(options.recorderToken && { recorderToken: options.recorderToken }),
      }),
    });
    let response = await send();
    if (response.status === 401 && !options.recorderToken && await tryOAuthRefresh()) response = await send();
    const result = await response.json() as { caption?: ClassroomCaptionSnapshot; revision?: number };
    // An ignored callback or a login HTML/empty response is never an ack.
    if (!response.ok || result.caption?.id !== caption.id ||
        typeof result.caption.text !== "string" || typeof result.caption.isFinal !== "boolean" ||
        !result.caption.translations || !captionContains(result.caption, caption)) {
      throw new Error(`Caption was not acknowledged (${response.status})`);
    }
    return { ...result, caption: result.caption };
  });
}

/** Runs under AuthProvider, so leaving the classroom does not stop delivery.
 * Only the currently authenticated account's entries are replayed. */
export function startCaptionOutboxRecovery(ownerId: string) {
  const queues = new Map<string, ReturnType<typeof createCaptionPersistenceQueue>>();
  const controller = new AbortController();
  const report = (error: unknown) => console.warn("[classroom:captions] queued delivery pending", error);
  const recover = () => {
    try {
      const sessions = captionOutboxSessions(window.localStorage, ownerId);
      for (const sessionId of sessions) {
        let queue = queues.get(sessionId);
        if (!queue) {
          queue = createCaptionPersistenceQueue(async caption => {
            await deliverClassroomCaption(sessionId, caption, { signal: controller.signal });
          }, report, 300, { store: createCaptionOutbox(window.localStorage, ownerId, sessionId) });
          queues.set(sessionId, queue);
        }
        void queue.flush();
      }
    } catch (error) { report(error); }
  };
  recover();
  const timer = window.setInterval(recover, 10_000);
  window.addEventListener("online", recover);
  window.addEventListener("storage", recover);
  document.addEventListener("visibilitychange", recover);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("online", recover);
    window.removeEventListener("storage", recover);
    document.removeEventListener("visibilitychange", recover);
    queues.forEach(queue => queue.dispose());
    controller.abort();
  };
}
