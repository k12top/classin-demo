import { randomUUID } from "node:crypto";
import { getAliyunOssClient } from "@/lib/aliyun-oss";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Check the actual raster format rather than trusting the uploaded MIME type. */
export function matchesAvatarContentType(bytes: Uint8Array, contentType: string): boolean {
  const startsWith = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  switch (contentType) {
    case "image/jpeg":
      return bytes.length >= 4 && startsWith([0xff, 0xd8, 0xff]);
    case "image/png":
      return bytes.length >= 24 && startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return bytes.length >= 13 && (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
    case "image/webp":
      return bytes.length >= 16 && startsWith([0x52, 0x49, 0x46, 0x46]) &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    default:
      return false;
  }
}

export async function storeAvatar(bytes: Buffer, contentType: string): Promise<string> {
  const extension = EXTENSIONS[contentType];
  if (!extension || !matchesAvatarContentType(bytes, contentType)) {
    throw new Error("Invalid avatar image");
  }
  const filename = `${randomUUID()}.${extension}`;
  await getAliyunOssClient().put(`avatars/${filename}`, bytes, { mime: contentType });
  // Keep a durable application URL; signed OSS URLs expire.
  return `/api/avatars/${filename}`;
}

export function avatarObjectKey(filename: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/.test(filename)
    ? `avatars/${filename}`
    : null;
}
