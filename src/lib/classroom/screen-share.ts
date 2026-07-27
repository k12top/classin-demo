import { classroomRuntimeDefaults } from "@/lib/classroom/config";

const MAX_AGORA_USER_ACCOUNT_BYTES = 255;

export function buildScreenShareUserId(userId: string): string {
  const suffix = classroomRuntimeDefaults.screenShareUidSuffix;
  const candidate = `${userId}${suffix}`;
  if (new TextEncoder().encode(candidate).byteLength <= MAX_AGORA_USER_ACCOUNT_BYTES) {
    return candidate;
  }

  // Deterministic FNV-1a is sufficient here: this is an RTC account suffix,
  // not a security token.
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `screen-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isScreenShareUserId(userId: string): boolean {
  return (
    userId.endsWith(classroomRuntimeDefaults.screenShareUidSuffix) ||
    userId.startsWith("screen-")
  );
}
