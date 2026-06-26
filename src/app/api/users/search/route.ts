/**
 * Search auth users (for course access assignment)
 * GET /api/users/search?q=xxx
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { DirectoryUserRole, listDirectoryUsers } from "@/lib/user-directory";

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
        hint: "当前账号未识别为教师，无法搜索学生。请为用户分配教师角色或加入 teacher 用户组。",
      },
      { status: 403 }
    );
  }

  const query = request.nextUrl.searchParams.get("q") || "";
  const roleFilter = request.nextUrl.searchParams.get("role");
  const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
  if (roleFilter && roleFilter !== "teacher" && roleFilter !== "student") {
    return NextResponse.json({ error: "Invalid role filter" }, { status: 400 });
  }

  try {
    const users = await listDirectoryUsers({
      query,
      role: roleFilter as DirectoryUserRole | undefined,
      excludeUserId: session.userId,
      limit,
    });

    return NextResponse.json(
      {
        users,
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
