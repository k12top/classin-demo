import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { classroomRuntimeDefaults } from "@/lib/classroom/config";
import { recorderPageOrigin } from "@/lib/classroom/recorder-origin";
import { ClassroomProviderConfigurationError } from "@/lib/classroom/server/errors";

const RECORDER_PAGE_CHECK_TIMEOUT_MS = 10_000;

function recorderKey(): Uint8Array | null {
  const secret = process.env.CLASSROOM_RECORDER_SECRET?.trim();
  return secret ? new TextEncoder().encode(secret) : null;
}

export function isRecorderPageConfigured(): boolean {
  return Boolean(
    recorderKey() && recorderPageOrigin(process.env),
  );
}

export async function createRecorderPageUrl(
  courseId: string,
): Promise<string | null> {
  const key = recorderKey();
  const base = recorderPageOrigin(process.env);
  if (!key || !base) return null;
  const token = await new SignJWT({
    courseId,
    scope: "classroom-recorder",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(classroomRuntimeDefaults.recorderPageTokenTtl)
    .sign(key);
  const url = new URL("/classroom/recorder", base);
  url.searchParams.set("courseId", courseId);
  url.searchParams.set("recorderToken", token);
  url.searchParams.set("is_recorder", "1");
  return url.toString();
}

export async function assertRecorderPageReachable(pageUrl: string) {
  let response: Response;
  try {
    response = await fetch(pageUrl, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(RECORDER_PAGE_CHECK_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ClassroomProviderConfigurationError(
      `CLASSROOM_PUBLIC_BASE_URL is unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok) {
    throw new ClassroomProviderConfigurationError(
      `CLASSROOM_PUBLIC_BASE_URL does not expose /classroom/recorder (HTTP ${response.status})`,
    );
  }
}

export async function verifyRecorderToken(
  token: string,
  expectedCourseId: string,
): Promise<boolean> {
  const key = recorderKey();
  if (!key || !token) return false;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    return (
      payload.scope === "classroom-recorder" &&
      payload.courseId === expectedCourseId
    );
  } catch {
    return false;
  }
}
