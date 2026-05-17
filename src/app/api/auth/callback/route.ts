/**
 * OAuth callback handler
 * Casdoor redirects here with ?code=xxx&state=xxx
 * We exchange code for tokens, parse user info, create session, redirect to dashboard
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForTokens,
  parseJwtPayload,
  determineRole,
} from "@/lib/casdoor-server";
import { createSession } from "@/lib/session";
import { AUTH_RETURN_COOKIE, safeNextPath } from "@/lib/auth-login";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const casdoorUser = parseJwtPayload(tokens.access_token);
    const role = determineRole(casdoorUser.roles || []);

    await createSession(
      {
        userId: casdoorUser.id || casdoorUser.name,
        name: casdoorUser.name,
        displayName: casdoorUser.displayName || casdoorUser.name,
        avatar: casdoorUser.avatar || "",
        role,
        email: casdoorUser.email || "",
        casdoorToken: tokens.access_token,
      },
      tokens.refresh_token
        ? { refreshToken: tokens.refresh_token }
        : undefined
    );

    const cookieStore = await cookies();
    const returnTo = safeNextPath(
      cookieStore.get(AUTH_RETURN_COOKIE)?.value ?? "/"
    );
    const response = NextResponse.redirect(new URL(returnTo, request.url));
    response.cookies.delete(AUTH_RETURN_COOKIE);
    return response;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL(
        `/login?error=auth_failed&message=${encodeURIComponent(String(error))}`,
        request.url
      )
    );
  }
}
