import { NextRequest, NextResponse } from "next/server";
import { normalizeParentOrigin } from "@/lib/classroom/integration-events";
import { isAllowedClassroomMutation } from "@/lib/classroom/embed-policy";

// SameSite=None permits iframe authentication. Keep cookie-authenticated API
// writes same-origin; the parent platform communicates through postMessage.
export function proxy(request: NextRequest) {
  // These routes deliberately ignore cookies and accept anonymous writes.
  if (/^\/api\/public\/v1\/courses(?:\/|$)/.test(request.nextUrl.pathname)) return NextResponse.next();
  if (!isAllowedClassroomMutation({
    method: request.method, hasSessionCookie: request.cookies.has("classroom_session"),
    origin: request.headers.get("origin"), requestOrigin: normalizeParentOrigin(process.env.CLASSROOM_PUBLIC_BASE_URL) || request.nextUrl.origin,
    fetchSite: request.headers.get("sec-fetch-site"),
  })) return NextResponse.json({ error: "Cross-origin mutation is not allowed" }, { status: 403 });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
