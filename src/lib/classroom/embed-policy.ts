import { normalizeParentOrigin } from "./integration-events";

export function classroomEmbedOrigins(raw = process.env.CLASSROOM_EMBED_ALLOWED_ORIGINS ?? "") {
  return [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean).map((value) => {
    const origin = normalizeParentOrigin(value);
    if (!origin || new URL(value).pathname !== "/" || new URL(value).search || new URL(value).hash) throw new Error("CLASSROOM_EMBED_ALLOWED_ORIGINS requires comma-separated HTTP(S) origins");
    return origin;
  }))];
}

export function classroomCookiePolicy(sameSite = process.env.CLASSROOM_SESSION_COOKIE_SAME_SITE, production = process.env.NODE_ENV === "production") {
  return { sameSite: sameSite === "none" ? "none" as const : "lax" as const, secure: production || sameSite === "none" };
}

export function isAllowedClassroomMutation(input: { method: string; hasSessionCookie: boolean; origin: string | null; requestOrigin: string; fetchSite: string | null }, crossSiteCookies = process.env.CLASSROOM_SESSION_COOKIE_SAME_SITE === "none") {
  if (!crossSiteCookies || !input.hasSessionCookie || ["GET", "HEAD", "OPTIONS"].includes(input.method)) return true;
  if (input.origin) return input.origin === input.requestOrigin;
  return input.fetchSite === "same-origin";
}
