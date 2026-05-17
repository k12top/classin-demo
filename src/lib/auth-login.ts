/** Server sets this before redirecting to Casdoor; callback restores the path. */
export const AUTH_RETURN_COOKIE = "auth_return_to";

/** Browser hits this route; server responds with 302 to Casdoor authorize URL. */
export const SSO_LOGIN_PATH = "/api/auth/login";

export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

/** Relative URL for SSO login (optional post-login return path). */
export function ssoLoginUrl(next?: string): string {
  const path = safeNextPath(next ?? null);
  if (path === "/") return SSO_LOGIN_PATH;
  return `${SSO_LOGIN_PATH}?next=${encodeURIComponent(path)}`;
}

/** Full-page redirect to Casdoor SSO via `/api/auth/login`. */
export function redirectToSsoLogin(next?: string): void {
  if (typeof window === "undefined") return;
  const target =
    next ??
    `${window.location.pathname}${window.location.search}`;
  window.location.href = ssoLoginUrl(
    target === "/" ? undefined : target
  );
}
