/**
 * Next.js 16 Proxy — route protection
 * Unauthenticated browser visits redirect to `/api/auth/login` (Casdoor SSO).
 * When session JWT is invalid/expired but Casdoor refresh cookie exists, redirects to `/api/auth/refresh`.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  decrypt,
  SESSION_COOKIE,
  OAUTH_REFRESH_COOKIE,
} from "@/lib/session";
import { safeNextPath, SSO_LOGIN_PATH } from "@/lib/auth-login";

function redirectToRefresh(req: NextRequest): NextResponse {
  const next = safeNextPath(
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  );
  const u = new URL("/api/auth/refresh", req.nextUrl.origin);
  u.searchParams.set("next", next);
  return NextResponse.redirect(u);
}

function redirectToSsoLogin(req: NextRequest): NextResponse {
  const next = safeNextPath(
    `${req.nextUrl.pathname}${req.nextUrl.search}`
  );
  const u = new URL(SSO_LOGIN_PATH, req.nextUrl.origin);
  if (next !== "/") {
    u.searchParams.set("next", next);
  }
  return NextResponse.redirect(u);
}

/** UI routes that do not require a session (exact path). */
const PUBLIC_PAGES = new Set(["/login", "/session-expired", "/access-denied"]);

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  const refreshCookie = req.cookies.get(OAUTH_REFRESH_COOKIE)?.value;
  const session = sessionCookie ? await decrypt(sessionCookie) : null;

  if (PUBLIC_PAGES.has(path)) {
    if (
      session &&
      (path === "/login" || path === "/session-expired")
    ) {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
    return NextResponse.next();
  }

  if (!sessionCookie) {
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    if (refreshCookie) {
      return redirectToRefresh(req);
    }
    return redirectToSsoLogin(req);
  }

  if (!session) {
    if (refreshCookie && !path.startsWith("/api/")) {
      const res = redirectToRefresh(req);
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }

    const response = path.startsWith("/api/")
      ? NextResponse.json(
          { error: "Session expired", code: "SESSION_EXPIRED" },
          { status: 401 }
        )
      : redirectToSsoLogin(req);

    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$|.*\\.ico$).*)",
  ],
};
