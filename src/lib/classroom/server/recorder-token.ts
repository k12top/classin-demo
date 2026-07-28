import "server-only";

import { SignJWT, jwtVerify } from "jose";

const RECORDER_TOKEN_TTL = "8h";

function recorderKey(): Uint8Array | null {
  const secret = process.env.CLASSROOM_RECORDER_SECRET?.trim();
  return secret ? new TextEncoder().encode(secret) : null;
}

export function isRecorderPageConfigured(): boolean {
  return Boolean(
    recorderKey() && process.env.CLASSROOM_PUBLIC_BASE_URL?.trim(),
  );
}

export async function createRecorderPageUrl(
  courseId: string,
): Promise<string | null> {
  const key = recorderKey();
  const base = process.env.CLASSROOM_PUBLIC_BASE_URL?.trim();
  if (!key || !base) return null;
  const token = await new SignJWT({
    courseId,
    scope: "classroom-recorder",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(RECORDER_TOKEN_TTL)
    .sign(key);
  const url = new URL("/classroom/recorder", base);
  url.searchParams.set("courseId", courseId);
  url.searchParams.set("recorderToken", token);
  url.searchParams.set("is_recorder", "1");
  return url.toString();
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
