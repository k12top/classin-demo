/**
 * Get current authenticated user info from session
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();

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
