/**
 * Search Casdoor users (for course access assignment)
 * GET /api/users/search?q=xxx
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { searchCasdoorUsers } from "@/lib/casdoor-server";
import { resolveCasdoorUserId } from "@/lib/casdoor-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "teacher") {
    return NextResponse.json(
      {
        error: "Forbidden",
        hint: "当前账号在 Casdoor 中未识别为教师，无法搜索学生。请在 Casdoor 为用户分配教师角色或加入 teacher 用户组。",
      },
      { status: 403 }
    );
  }

  const query = request.nextUrl.searchParams.get("q") || "";

  try {
    const users = await searchCasdoorUsers(query, {
      excludeUserId: session.userId,
      studentsOnly: false,
      limit: 50,
    });

    return NextResponse.json(
      {
        users: users.map((u) => ({
          id: resolveCasdoorUserId(u),
          casdoorUuid: u.id,
          name: u.name,
          displayName: u.displayName || u.name,
          email: u.email,
          avatar: u.avatar,
          groups: u.groups ?? [],
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Failed to search users:", error);
    return NextResponse.json({ error: "Failed to search users" }, { status: 500 });
  }
}
