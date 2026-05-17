/**
 * Session management using jose (JWT) + HttpOnly cookies
 * Following Next.js 16 recommended patterns
 */
import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { cookies } from "next/headers";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "fallback-secret-change-me-in-production-32chars!";
const encodedKey = new TextEncoder().encode(SESSION_SECRET);
export const SESSION_COOKIE = "classroom_session";
/** HttpOnly cookie storing Casdoor OAuth refresh_token (when issued). */
export const OAUTH_REFRESH_COOKIE = "classroom_oauth_refresh";
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Refresh cookie lifetime — Casdoor may rotate tokens sooner; this is an upper bound for the cookie. */
const REFRESH_COOKIE_MAX_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionPayload extends JWTPayload {
  userId: string;
  name: string;
  displayName: string;
  avatar: string;
  role: "teacher" | "student";
  email: string;
  casdoorToken: string; // original Casdoor access token
  expiresAt: string;
}

/**
 * Encrypt session data into a JWT
 */
export async function encrypt(
  payload: Omit<SessionPayload, "iat" | "exp">
): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

/**
 * Decrypt and verify a session JWT
 */
export async function decrypt(session: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export type CreateSessionOAuthOptions = {
  /** When set, stores Casdoor refresh_token in a separate HttpOnly cookie. */
  refreshToken?: string;
};

/**
 * Create a new session cookie; optionally persist OAuth refresh token.
 */
export async function createSession(
  data: Omit<SessionPayload, "expiresAt" | "iat" | "exp">,
  oauth?: CreateSessionOAuthOptions
): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION).toISOString();
  const session = await encrypt({ ...data, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    sameSite: "lax",
    path: "/",
  });

  if (oauth?.refreshToken?.trim()) {
    const refreshExpires = new Date(Date.now() + REFRESH_COOKIE_MAX_MS);
    cookieStore.set(OAUTH_REFRESH_COOKIE, oauth.refreshToken.trim(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: refreshExpires,
      sameSite: "lax",
      path: "/",
    });
  }
}

/**
 * Get current session from cookie
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;
  return decrypt(sessionCookie);
}

/**
 * Delete the session cookie and OAuth refresh cookie (logout / refresh failure)
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(OAUTH_REFRESH_COOKIE);
}
