import { createHash } from "node:crypto";

export function classroomSignalingUserId(userId: string): string {
  return Buffer.byteLength(userId, "utf8") <= 64 ? userId :
    `user-${createHash("sha256").update(userId).digest("hex").slice(0, 48)}`;
}
