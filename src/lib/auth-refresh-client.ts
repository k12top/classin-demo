/**
 * Client-only: silent OAuth session refresh (Casdoor refresh_token cookie).
 */
export async function tryOAuthRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    });
    return res.ok;
  } catch {
    return false;
  }
}
