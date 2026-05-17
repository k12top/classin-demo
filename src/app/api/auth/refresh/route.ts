/**
 * OAuth token refresh — GET for browser redirect recovery, POST for silent refresh (XHR).
 * Requires Casdoor refresh_token (stored in HttpOnly cookie after login when IdP returns it).
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAUTH_REFRESH_COOKIE } from "@/lib/session";
import { refreshSessionWithToken } from "@/lib/refresh-session";
import { safeNextPath, SSO_LOGIN_PATH } from "@/lib/auth-login";

function redirectToSsoLogin(request: NextRequest, nextPath: string): NextResponse {
  const u = new URL(SSO_LOGIN_PATH, request.url);
  if (nextPath !== "/") {
    u.searchParams.set("next", nextPath);
  }
  return NextResponse.redirect(u);
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(OAUTH_REFRESH_COOKIE)?.value;
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!refresh) {
    return redirectToSsoLogin(request, nextPath);
  }

  const ok = await refreshSessionWithToken(refresh);
  if (!ok) {
    return redirectToSsoLogin(request, nextPath);
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}

export async function POST() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(OAUTH_REFRESH_COOKIE)?.value;
  if (!refresh) {
    return NextResponse.json(
      { ok: false, code: "NO_REFRESH_TOKEN" },
      { status: 401 }
    );
  }

  const ok = await refreshSessionWithToken(refresh);
  if (!ok) {
    return NextResponse.json(
      { ok: false, code: "REFRESH_FAILED" },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
