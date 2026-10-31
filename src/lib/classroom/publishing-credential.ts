import type { ClassroomJoinCredential } from "./types";
import { ClassroomRecoveryError, retryClassroomRecovery } from "./credential-recovery";
import { withClassroomRequestSignal } from "./request-signal";

/** Preparing a publisher is separate from capture, preserving the later click's
 * browser activation. Temporary failures retry finitely; permissions never do.
 */
export function requestClassroomPublishingCredential(input: {
  sessionId: string; clientId: string; shareAccess?: string | null; screen: boolean; signal: AbortSignal;
  onResponse?: (status: number, payload: Record<string, unknown>) => boolean;
  refreshAuth?: () => Promise<boolean>;
  fetcher?: typeof fetch;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  return retryClassroomRecovery(() => withClassroomRequestSignal(8_000, input.signal, async signal => {
    const send = () => (input.fetcher || fetch)("/api/classroom/session/publish-credential", {
      signal, method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: input.sessionId, clientId: input.clientId, ...(input.shareAccess && { shareAccess: input.shareAccess }) }),
    });
    let response = await send();
    if (response.status === 401 && await input.refreshAuth?.()) response = await send();
    const payload = await response.json() as { credential?: ClassroomJoinCredential; [key: string]: unknown };
    if (input.onResponse?.(response.status, payload)) throw new DOMException("Classroom ended", "AbortError");
    if (!response.ok || !payload.credential?.publishAllowed || (input.screen && !payload.credential.screenShare)) {
      throw new ClassroomRecoveryError(response.ok ? 502 : response.status, Number(response.headers.get("Retry-After") || 0) * 1_000);
    }
    return payload.credential;
  }), { signal: input.signal, maxAttempts: 3, jitter: true, wait: input.wait });
}
