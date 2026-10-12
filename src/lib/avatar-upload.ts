export const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const AVATAR_FILE_ACCEPT = AVATAR_CONTENT_TYPES.join(",");

export type AvatarUploadErrorCode =
  | "AVATAR_FILE_REQUIRED"
  | "AVATAR_FILE_TOO_LARGE"
  | "AVATAR_FILE_TYPE_INVALID";

export function validateAvatarFile(
  file: Pick<File, "size" | "type">,
): AvatarUploadErrorCode | null {
  if (file.size <= 0) return "AVATAR_FILE_REQUIRED";
  if (file.size > MAX_AVATAR_SIZE) return "AVATAR_FILE_TOO_LARGE";
  if (!AVATAR_CONTENT_TYPES.some((type) => type === file.type)) {
    return "AVATAR_FILE_TYPE_INVALID";
  }
  return null;
}
