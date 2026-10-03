import OSS from "ali-oss";

const DEFAULT_PREFIX = "courseware";
const REQUIRED_ENV_NAMES = [
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
] as const;

type RequiredEnvName = (typeof REQUIRED_ENV_NAMES)[number];

export class CoursewareStorageConfigurationError extends Error {
  constructor(public readonly missingVariables: readonly RequiredEnvName[]) {
    super(`OSS is not configured: missing ${missingVariables.join(", ")}`);
    this.name = "CoursewareStorageConfigurationError";
  }
}

function coursewareOssConfig() {
  const missingVariables = REQUIRED_ENV_NAMES.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missingVariables.length > 0) {
    throw new CoursewareStorageConfigurationError(missingVariables);
  }

  return {
    region: process.env.ALIYUN_OSS_REGION!.trim(),
    bucket: process.env.ALIYUN_OSS_BUCKET!.trim(),
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID!.trim(),
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET!.trim(),
  };
}

export function getCoursewareOssClient(): OSS {
  const config = coursewareOssConfig();
  return new OSS({
    ...config,
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
