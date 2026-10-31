import "server-only";
import { createHash } from "node:crypto";
import type { ClassroomCaptionSnapshot } from "../types";
import type { CaptionSync } from "../caption-sync";

const HASH_BYTES = 12;
const HEADER_BYTES = 1 + HASH_BYTES;
const ENTRY_BYTES = HASH_BYTES * 2;
const WINDOW = 100;
const MAX_CURSOR_LENGTH = Math.ceil((HEADER_BYTES + WINDOW * ENTRY_BYTES) * 4 / 3);
const digest = (value: string) => createHash("sha256").update(value).digest().subarray(0, HASH_BYTES);

/** A bounded, stateless validator for the existing recent-caption window.
 * Compare contents, not speech timestamps: old sentences can acquire corrected
 * text, translations or job status without a new occurredAt/updatedAt value.
 * This is a read hint only; callers must authorize before reading any captions.
 */
export function classroomCaptionDelta(sessionId: string, captions: ClassroomCaptionSnapshot[], cursor?: string | null): {
  captions: ClassroomCaptionSnapshot[]; captionSync: CaptionSync;
} {
  const session = digest(sessionId);
  let previous: Map<string, string> | null = null;
  if (cursor && cursor.length <= MAX_CURSOR_LENGTH && /^[A-Za-z0-9_-]+$/.test(cursor)) {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") === cursor && bytes[0] === 1 &&
      bytes.length >= HEADER_BYTES && (bytes.length - HEADER_BYTES) % ENTRY_BYTES === 0 &&
      bytes.subarray(1, HEADER_BYTES).equals(session)) {
      previous = new Map();
      for (let offset = HEADER_BYTES; offset < bytes.length; offset += ENTRY_BYTES) {
        previous.set(bytes.subarray(offset, offset + HASH_BYTES).toString("hex"), bytes.subarray(offset + HASH_BYTES, offset + ENTRY_BYTES).toString("hex"));
      }
    }
  }
  const entries = captions.slice(-WINDOW).map(caption => {
    // Canonicalize object keys so serialization order is not a content change.
    const content = JSON.stringify(caption, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
    return { caption, id: digest(caption.id), version: digest(content) };
  });
  const nextCursor = Buffer.concat([Buffer.from([1]), session, ...[...entries].sort((a, b) => Buffer.compare(a.id, b.id)).flatMap(entry => [entry.id, entry.version])]).toString("base64url");
  return {
    captions: entries.filter(entry => previous?.get(entry.id.toString("hex")) !== entry.version.toString("hex")).map(entry => entry.caption),
    // An unchanged poll needs neither caption history nor another copy of its cursor.
    captionSync: { mode: previous ? "delta" : "snapshot", ...(nextCursor !== cursor && { cursor: nextCursor }) },
  };
}
