/**
 * Session management using jose (JWT) + HttpOnly cookies
 * Following Next.js 16 recommended patterns
 */
import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import {
  parseJwtPayload,
  determineRole,
} from "@/lib/casdoor-server";
import { resolveSessionUserId } from "@/lib/casdoor-user";

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
  expiresAt: string;
}

export type SessionUserData = Omit<SessionPayload, "expiresAt" | "iat" | "exp">;

export type BuiltSessionCookies = {
  sessionToken: string;
  sessionExpires: Date;
  refreshToken?: string;
};

const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  expires,
  sameSite: "lax" as const,
  path: "/",
});

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
 * Build session JWT + optional refresh token (do not store Casdoor access_token in cookie — too large).
 */
export async function buildSessionCookies(
  data: SessionUserData,
  oauth?: CreateSessionOAuthOptions
): Promise<BuiltSessionCookies> {
  const sessionExpires = new Date(Date.now() + SESSION_DURATION);
  const sessionToken = await encrypt({
    ...data,
    expiresAt: sessionExpires.toISOString(),
  });
  return {
    sessionToken,
    sessionExpires,
    refreshToken: oauth?.refreshToken?.trim() || undefined,
  };
}

/** Attach session cookies to a Route Handler response (required for redirects). */
export function attachSessionCookies(
  response: NextResponse,
  built: BuiltSessionCookies
): void {
  response.cookies.set(
    SESSION_COOKIE,
    built.sessionToken,
    sessionCookieOptions(built.sessionExpires)
  );

  if (built.refreshToken) {
    const refreshExpires = new Date(Date.now() + REFRESH_COOKIE_MAX_MS);
    response.cookies.set(
      OAUTH_REFRESH_COOKIE,
      built.refreshToken,
      sessionCookieOptions(refreshExpires)
    );
  }
}

/**
 * Create a new session cookie; optionally persist OAuth refresh token.
 */
export async function createSession(
  data: SessionUserData,
  oauth?: CreateSessionOAuthOptions
): Promise<BuiltSessionCookies> {
  const built = await buildSessionCookies(data, oauth);
  const cookieStore = await cookies();

  cookieStore.set(
    SESSION_COOKIE,
    built.sessionToken,
    sessionCookieOptions(built.sessionExpires)
  );

  if (built.refreshToken) {
    const refreshExpires = new Date(Date.now() + REFRESH_COOKIE_MAX_MS);
    cookieStore.set(
      OAUTH_REFRESH_COOKIE,
      built.refreshToken,
      sessionCookieOptions(refreshExpires)
    );
  }

  return built;
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
 * Get session from cookie or Authorization: Bearer header.
 * Supports three auth methods:
 * 1. Cookie — browser flow (our own session JWT)
 * 2. Bearer token — our session JWT (from service-token endpoint)
 * 3. Bearer token — Casdoor access_token (from same Casdoor, different app)
 */
export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionPayload | null> {
  // 1. Try cookie first (browser flow)
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie);
    if (payload) return payload;
  }

  // 2. Try Authorization: Bearer header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // 2a. Try as our own session JWT (signed with SESSION_SECRET)
    const ourPayload = await decrypt(token);
    if (ourPayload) return ourPayload;

    // 2b. Try as Casdoor access_token (same IdP, different app)
    const casdoorPayload = await parseCasdoorBearerToken(token);
    if (casdoorPayload) return casdoorPayload;
  }

  return null;
}

/**
 * Parse a Casdoor JWT into our SessionPayload.
 * Decodes the JWT payload, checks expiry, resolves role and userId.
 */
async function parseCasdoorBearerToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const casdoorUser = parseJwtPayload(token);

    // Check token expiry (Casdoor JWTs have `exp` claim)
    const parts = token.split(".");
    if (parts.length === 3) {
      const rawPayload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf-8")
      );
      const exp = rawPayload.exp;
      if (exp && Date.now() >= exp * 1000) {
        return null; // Token expired
      }
    }

    const role = determineRole(casdoorUser.roles, casdoorUser.groups);
    const userId = resolveSessionUserId(casdoorUser, role);

    const expiresAt = new Date(Date.now() + SESSION_DURATION);
    return {
      userId,
      name: casdoorUser.name,
      displayName: casdoorUser.displayName || casdoorUser.name,
      avatar: casdoorUser.avatar || "",
      role,
      email: casdoorUser.email || "",
      expiresAt: expiresAt.toISOString(),
    } as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Delete the session cookie and OAuth refresh cookie (logout / refresh failure)
 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(OAUTH_REFRESH_COOKIE);
}
