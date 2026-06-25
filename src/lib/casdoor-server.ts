/**
 * Auth provider server integration — for JWT verification and user API calls
 * This file should only be imported in server-side code (API routes, server components)
 *
 * URLs are read at call time so `.env` changes apply after restart.
 * Use `NEXT_PUBLIC_CASDOOR_SERVER_URL` or server-only `CASDOOR_SERVER_URL` (same value, not sent to browser).
 */
import {
  casdoorUserIdsMatch,
  isTeacherGroupMember,
  resolveCasdoorUserId,
} from "@/lib/casdoor-user";

function getCasdoorServerUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL?.trim() ||
    process.env.CASDOOR_SERVER_URL?.trim() ||
    ""
  );
}

function getClientId(): string {
  return process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID?.trim() || "";
}

function getClientSecret(): string {
  return process.env.CASDOOR_CLIENT_SECRET?.trim() || "";
}

function getOrgName(): string {
  return process.env.NEXT_PUBLIC_CASDOOR_ORG_NAME?.trim() || "";
}

function getAppName(): string {
  return process.env.NEXT_PUBLIC_CASDOOR_APP_NAME?.trim() || "";
}

export interface CasdoorUser {
  id: string;
  name: string;
  displayName: string;
  avatar: string;
  email: string;
  phone: string;
  roles: CasdoorRole[];
  groups?: string[];
  tag: string;
  owner: string;
}

export interface CasdoorRole {
  name: string;
  displayName: string;
  owner: string;
}

/** OAuth token response from the configured auth provider. */
export interface CasdoorTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function postTokenRequest(params: URLSearchParams): Promise<CasdoorTokenResponse> {
  const base = getCasdoorServerUrl();
  if (!base) {
    throw new Error(
      "Auth server URL is not set. Define NEXT_PUBLIC_CASDOOR_SERVER_URL or CASDOOR_SERVER_URL."
    );
  }
  const tokenUrl = `${base.replace(/\/$/, "")}/api/login/oauth/access_token`;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth token request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const access_token = data.access_token as string | undefined;
  if (!access_token) {
    throw new Error(`No access_token in response: ${JSON.stringify(data)}`);
  }

  return {
    access_token,
    refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

/**
 * Exchange authorization code for tokens.
 * Enable refresh tokens in the auth application; optionally use a scope that includes offline access
 * (see NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE).
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<CasdoorTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getClientId(),
    client_secret: getClientSecret(),
    code,
    redirect_uri: redirectUri,
  });
  return postTokenRequest(params);
}

/**
 * Refresh access token using OAuth2 refresh_token grant.
 */
export async function refreshAccessToken(refreshToken: string): Promise<CasdoorTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getClientId(),
    client_secret: getClientSecret(),
    refresh_token: refreshToken,
  });
  return postTokenRequest(params);
}

/**
 * Parse an auth JWT token to extract user claims.
 */
export function parseJwtPayload(token: string): CasdoorUser {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  const payload = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf-8")
  );
  const org = getOrgName();
  return {
    id: payload.id || payload.sub || "",
    name: payload.name || "",
    displayName: payload.displayName || payload.name || "",
    avatar: payload.avatar || "",
    email: payload.email || "",
    phone: payload.phone || "",
    roles: payload.roles || [],
    groups: Array.isArray(payload.groups) ? payload.groups : [],
    tag: payload.tag || "",
    owner: payload.owner || org,
  };
}

/**
 * Determine teacher vs student from auth roles and/or groups (JWT or user list).
 */
export function determineRole(
  roles: CasdoorRole[],
  groups?: string[] | null
): "teacher" | "student" {
  if (isTeacherGroupMember(groups)) {
    return "teacher";
  }
  for (const role of roles) {
    const name = role.name.toLowerCase();
    if (
      name.includes("teacher") ||
      name.includes("老师") ||
      name.includes("教师")
    ) {
      return "teacher";
    }
  }
  return "student";
}

/**
 * Get user details from the auth provider API.
 */
export async function getCasdoorUser(username: string): Promise<CasdoorUser | null> {
  const base = getCasdoorServerUrl();
  const org = getOrgName();
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!base || !org) return null;

  try {
    const url = `${base.replace(/\/$/, "")}/api/get-user?id=${org}/${username}&clientId=${clientId}&clientSecret=${clientSecret}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || data;
  } catch {
    return null;
  }
}

export type SearchCasdoorUsersOptions = {
  /** Exclude this login name (typically current teacher). */
  excludeUserId?: string;
  /** When true, omit users in teacher groups. */
  studentsOnly?: boolean;
  limit?: number;
};

/**
 * Search users in the auth organization (for assigning students).
 */
export async function searchCasdoorUsers(
  query: string,
  options: SearchCasdoorUsersOptions = {}
): Promise<CasdoorUser[]> {
  const base = getCasdoorServerUrl();
  const org = getOrgName();
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!base || !org) return [];

  const limit = options.limit ?? 50;

  try {
    const url = `${base.replace(/\/$/, "")}/api/get-users?owner=${encodeURIComponent(org)}&clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error("Auth get-users HTTP", res.status, await res.text());
      return [];
    }
    const data = (await res.json()) as {
      status?: string;
      data?: CasdoorUser[];
    };
    if (data.status && data.status !== "ok") {
      console.error("Auth get-users status", data);
      return [];
    }

    let users: CasdoorUser[] = Array.isArray(data.data)
      ? data.data.map((raw) => {
          const u = raw as CasdoorUser & { groups?: string[] };
          return {
            ...u,
            groups: Array.isArray(u.groups) ? u.groups : [],
          };
        })
      : [];

    if (options.studentsOnly !== false) {
      users = users.filter((u) => !isTeacherGroupMember(u.groups));
    }

    if (options.excludeUserId) {
      const ex = options.excludeUserId;
      users = users.filter(
        (u) => !casdoorUserIdsMatch(resolveCasdoorUserId(u), ex)
      );
    }

    const q = query.trim().toLowerCase();
    if (q) {
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.displayName?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.id?.toLowerCase().includes(q)
      );
    }

    return users.slice(0, limit);
  } catch (e) {
    console.error("searchAuthUsers:", e);
    return [];
  }
}

/**
 * Get the sign-in URL for SSO redirect.
 * Set NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE to e.g. "read offline_access" if your IdP issues refresh tokens via scope.
 */
export function getServerSignInUrl(redirectUri: string): string {
  const base = getCasdoorServerUrl();
  if (!base) {
    throw new Error(
      "Auth server URL is not set. Define NEXT_PUBLIC_CASDOOR_SERVER_URL or CASDOOR_SERVER_URL in .env.local"
    );
  }
  const scope =
    process.env.NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE?.trim() || "read";
  const state = getAppName();
  const clientId = getClientId();
  return `${base.replace(/\/$/, "")}/login/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
}
