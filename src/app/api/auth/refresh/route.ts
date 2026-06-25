/**
 * OAuth token refresh — GET for browser redirect recovery, POST for silent refresh (XHR).
 * Requires refresh_token stored in an HttpOnly cookie after login when the IdP returns it.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { attachSessionCookies, OAUTH_REFRESH_COOKIE } from "@/lib/session";
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

  const built = await refreshSessionWithToken(refresh);
  if (!built) {
    return redirectToSsoLogin(request, nextPath);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  attachSessionCookies(response, built);
  return response;
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

  const built = await refreshSessionWithToken(refresh);
  if (!built) {
    return NextResponse.json(
      { ok: false, code: "REFRESH_FAILED" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true });
  attachSessionCookies(response, built);
  return response;
}
