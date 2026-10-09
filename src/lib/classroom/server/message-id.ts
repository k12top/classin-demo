import { createHash } from "node:crypto";

export function isClassroomClientMessageId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** The existing primary key deduplicates retries without a schema migration. */
export function classroomMessageRecordId(sessionId: string, senderId: string, clientMessageId: string) {
  return `chat-${createHash("sha256").update(JSON.stringify([sessionId, senderId, clientMessageId.toLowerCase()])).digest("hex")}`;
}
