import type { ClassroomCaptionSnapshot } from "./types";

export type CaptionSync = { mode: "snapshot" | "delta"; cursor?: string };
export type CaptionSyncResponse = { captions?: ClassroomCaptionSnapshot[]; captionSync?: CaptionSync };

/** A cursor only describes content already merged from an authorized HTTP reply.
 * Keep it outside the runtime revision: caption-only responses cannot advance it.
 */
export function createCaptionSyncState() {
  let context = "", cursor: string | undefined;
  return {
    query(key: string, query: URLSearchParams) {
      if (key !== context) { context = key; cursor = undefined; }
      if (cursor) query.set("captionCursor", cursor);
    },
    accept(key: string, payload: CaptionSyncResponse, merge: (captions: ClassroomCaptionSnapshot[]) => void) {
      if (key !== context || !Array.isArray(payload.captions)) return;
      // Merge first. Never acknowledge content skipped because a runtime reply
      // was stale, and never replace newer local partial/final/translation data.
      if (payload.captions.length) merge(payload.captions);
      if (payload.captionSync?.cursor) cursor = payload.captionSync.cursor;
      else if (!payload.captionSync) cursor = undefined; // Older-server compatibility.
    },
    reset() { context = ""; cursor = undefined; },
  };
}
