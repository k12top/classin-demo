/**
 * Logout handler — clears session cookie
 */
import { NextRequest, NextResponse } from "next/server";
import {
  deleteSession,
  OAUTH_REFRESH_COOKIE,
  SESSION_COOKIE,
} from "@/lib/session";

function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(OAUTH_REFRESH_COOKIE);
  return response;
}

export async function POST() {
  await deleteSession();
  return clearAuthCookies(NextResponse.json({ success: true }));
}

export async function GET(request: NextRequest) {
  await deleteSession();
  return clearAuthCookies(
    NextResponse.redirect(new URL("/login?logged_out=1", request.url))
  );
}
