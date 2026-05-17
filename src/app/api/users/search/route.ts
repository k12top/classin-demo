/**
 * Search Casdoor users (for student assignment)
 * GET /api/users/search?q=xxx
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { searchCasdoorUsers } from "@/lib/casdoor-server";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const query = request.nextUrl.searchParams.get("q") || "";

  try {
    const users = await searchCasdoorUsers(query);
    // Return simplified user list
    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id || u.name,
        name: u.name,
        displayName: u.displayName || u.name,
        email: u.email,
        avatar: u.avatar,
      })),
    });
  } catch (error) {
    console.error("Failed to search users:", error);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }
}
