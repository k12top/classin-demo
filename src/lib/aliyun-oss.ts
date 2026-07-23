import OSS from "ali-oss";

const DEFAULT_PREFIX = "courseware";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`OSS is not configured: missing ${name}`);
  }
  return value;
}

export function getCoursewareOssClient(): OSS {
  return new OSS({
    region: requiredEnv("ALIYUN_OSS_REGION"),
    bucket: requiredEnv("ALIYUN_OSS_BUCKET"),
    accessKeyId: requiredEnv("ALIYUN_OSS_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnv("ALIYUN_OSS_ACCESS_KEY_SECRET"),
    secure: true,
  });
}

function coursewarePrefix(): string {
  return (process.env.ALIYUN_OSS_COURSEWARE_PREFIX || DEFAULT_PREFIX)
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function safeFilename(filename: string): string {
  const sanitized = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "courseware";
}

export function createCoursewareObjectKey(courseId: string, filename: string): string {
  return `${coursewarePrefix()}/${courseId}/${crypto.randomUUID()}-${safeFilename(filename)}`;
}

export function isCoursewareObjectKey(courseId: string, objectKey: string): boolean {
  return objectKey.startsWith(`${coursewarePrefix()}/${courseId}/`);
}

export function toCoursewareStorageUrl(objectKey: string): string {
  return `oss://${objectKey}`;
}

export function getCoursewareObjectKey(storageUrl: string): string | null {
  return storageUrl.startsWith("oss://") ? storageUrl.slice("oss://".length) : null;
}
