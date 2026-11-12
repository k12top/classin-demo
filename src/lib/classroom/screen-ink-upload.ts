type InkUploadContext = { sessionId: string; clientId: string; claimId: string; origin: string; signal: AbortSignal };

/** Upload a stroke under the active sharing claim and return a viewer-neutral URL. */
export async function uploadScreenInk(data: string, context: InkUploadContext, request: typeof fetch = fetch): Promise<string> {
  const origin = new URL(context.origin);
  if (!isScreenInkUrlAllowed(origin) || origin.origin !== context.origin) throw new Error("SCREEN_INK_ORIGIN_UNAVAILABLE");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[1].length > 2 * 1024 * 1024 * 4 / 3 + 4) throw new Error("SCREEN_INK_INVALID_IMAGE");
  let binary: string;
  try { binary = atob(match[1]); } catch { throw new Error("SCREEN_INK_INVALID_IMAGE"); }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const uploadId = crypto.randomUUID();
  const endpoint = `/api/sessions/${encodeURIComponent(context.sessionId)}/classroom/screen-ink`;
  const form = new FormData();
  form.set("image", new Blob([bytes], { type: "image/png" }), "stroke.png");
  form.set("uploadId", uploadId);
  form.set("clientId", context.clientId);
  form.set("claimId", context.claimId);
  // Retry once only for transport failures; the same ID makes an uncertain
  // first response idempotent. Authorization failures must not be retried.
  let response: Response;
  try {
    response = await request(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", body: form, signal: context.signal });
  } catch (error) {
    if (context.signal.aborted) throw error;
    response = await request(endpoint, { method: "POST", credentials: "same-origin", cache: "no-store", body: form, signal: context.signal });
  }
  if (!response.ok) throw new Error("SCREEN_INK_UPLOAD_FAILED");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("image" in result) || !result.image || typeof result.image !== "object" || !("id" in result.image) || result.image.id !== uploadId) throw new Error("SCREEN_INK_UPLOAD_FAILED");
  return `${origin.origin}${endpoint}/${encodeURIComponent(uploadId)}`;
}
import { isScreenInkUrlAllowed } from "./whiteboard/screen-ink";
