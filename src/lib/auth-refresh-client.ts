/**
 * Client-only: silent OAuth session refresh.
 */
let pending: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
  });
  if (res.ok) return true;
  if (res.status === 401) return false;
  // Let callers' error paths preserve existing identity instead of redirecting.
  throw new Error("登录续期暂时不可用，请稍后重试");
}

export function tryOAuthRefresh(): Promise<boolean> {
  // Several mounted pages can request refresh together; serialize token rotation.
  pending ??= refresh().finally(() => { pending = null; });
  return pending;
}
