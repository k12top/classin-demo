/**
 * Casdoor server-side SDK — for JWT verification and user API calls
 * This file should only be imported in server-side code (API routes, server components)
 *
 * URLs are read at call time so `.env` changes apply after restart.
 * Use `NEXT_PUBLIC_CASDOOR_SERVER_URL` or server-only `CASDOOR_SERVER_URL` (same value, not sent to browser).
 */

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
  tag: string;
  owner: string;
}

export interface CasdoorRole {
  name: string;
  displayName: string;
  owner: string;
}

/** OAuth token response from Casdoor `/api/login/oauth/access_token` */
export interface CasdoorTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function postTokenRequest(params: URLSearchParams): Promise<CasdoorTokenResponse> {
  const base = getCasdoorServerUrl();
  if (!base) {
    throw new Error(
      "Casdoor server URL is not set. Define NEXT_PUBLIC_CASDOOR_SERVER_URL or CASDOOR_SERVER_URL."
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
    throw new Error(`Casdoor token request failed: ${res.status} ${text}`);
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
 * Enable refresh tokens in the Casdoor Application; optionally use a scope that includes offline access
 * (see NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE).
 */
export async function exchangeCodeForTokens(code: string): Promise<CasdoorTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getClientId(),
    client_secret: getClientSecret(),
    code,
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
 * Parse a Casdoor JWT token to extract user claims
 * Casdoor JWTs are standard JWTs; we decode the payload
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
    tag: payload.tag || "",
    owner: payload.owner || org,
  };
}

/**
 * Determine user role from Casdoor roles array
 * Looks for "teacher" or "student" role names (case-insensitive)
 */
export function determineRole(roles: CasdoorRole[]): "teacher" | "student" {
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
 * Get user details from Casdoor API
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

/**
 * Search users in the Casdoor organization (for assigning students)
 */
export async function searchCasdoorUsers(query: string): Promise<CasdoorUser[]> {
  const base = getCasdoorServerUrl();
  const org = getOrgName();
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!base || !org) return [];

  try {
    const url = `${base.replace(/\/$/, "")}/api/get-users?owner=${org}&clientId=${clientId}&clientSecret=${clientSecret}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const users: CasdoorUser[] = data.data || data || [];

    if (!query) return users;

    const q = query.toLowerCase();
    return users.filter(
      (u: CasdoorUser) =>
        u.name?.toLowerCase().includes(q) ||
        u.displayName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  } catch {
    return [];
  }
}

/**
 * Get the Casdoor sign-in URL for SSO redirect.
 * Set NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE to e.g. "read offline_access" if your IdP issues refresh tokens via scope.
 */
export function getServerSignInUrl(redirectUri: string): string {
  const base = getCasdoorServerUrl();
  if (!base) {
    throw new Error(
      "Casdoor server URL is not set. Define NEXT_PUBLIC_CASDOOR_SERVER_URL or CASDOOR_SERVER_URL in .env.local"
    );
  }
  const scope =
    process.env.NEXT_PUBLIC_CASDOOR_OAUTH_SCOPE?.trim() || "read";
  const state = getAppName();
  const clientId = getClientId();
  return `${base.replace(/\/$/, "")}/login/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
}
