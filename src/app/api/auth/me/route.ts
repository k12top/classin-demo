/**
 * Get current authenticated user info from session
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      userId: session.userId,
      name: session.name,
      displayName: session.displayName,
      avatar: session.avatar,
      role: session.role,
      email: session.email,
    },
  });
}
