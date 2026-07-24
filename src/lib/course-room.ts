import { randomBytes } from "node:crypto";

const LEGACY_ROOM_UUID_LENGTH = 16;

export function legacyCourseRoomUuid(courseId: string): string {
  return courseId.replace(/-/g, "").slice(0, LEGACY_ROOM_UUID_LENGTH);
}

export function courseIdToRoomUuid(
  courseId: string,
  storedRoomUuid?: string | null,
): string {
  const normalized = storedRoomUuid?.trim();
  return normalized || legacyCourseRoomUuid(courseId);
}

export function generateCourseRoomUuid(): string {
  return randomBytes(16).toString("hex");
}
