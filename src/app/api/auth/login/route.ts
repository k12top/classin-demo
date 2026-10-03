/**
 * Login redirect — sends user to SSO.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSignInUrl } from "@/lib/casdoor-server";
import { AUTH_RETURN_COOKIE, safeNextPath } from "@/lib/auth-login";
import { classroomCookiePolicy } from "@/lib/classroom/embed-policy";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/callback`;
  const signInUrl = getServerSignInUrl(redirectUri);
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(signInUrl);

  if (nextPath !== "/") {
    response.cookies.set(AUTH_RETURN_COOKIE, nextPath, {
      httpOnly: true,
      ...classroomCookiePolicy(),
      maxAge: 600,
      path: "/",
    });
  }

  return response;
}
