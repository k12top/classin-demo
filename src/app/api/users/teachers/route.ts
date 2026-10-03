import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { listDirectoryUsers } from "@/lib/user-directory";

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
        hint: "当前账号未识别为教师，无法查看老师列表。请为用户分配教师角色或加入 teacher 用户组。",
      },
      { status: 403 }
    );
  }

  try {
    const teachers = await listDirectoryUsers({
      query: request.nextUrl.searchParams.get("q") || "",
      role: "teacher",
      excludeUserId: session.userId,
      limit: Number(request.nextUrl.searchParams.get("limit") || 100),
    });

    return NextResponse.json(
      { teachers, users: teachers },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Failed to list teachers:", error);
    return NextResponse.json({ error: "Failed to list teachers" }, { status: 500 });
  }
}
