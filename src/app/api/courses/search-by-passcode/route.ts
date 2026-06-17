import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import { CourseStatus } from "@/lib/course-status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const passcode = request.nextUrl.searchParams.get("passcode");
  if (!passcode) {
    return NextResponse.json({ error: "请输入6位数字密码" }, { status: 400 });
  }

  const trimmed = passcode.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return NextResponse.json({ error: "密码格式错误，必须为6位数字" }, { status: 400 });
  }

  try {
    const courses = await prisma.course.findMany({
      where: {
        passcode: trimmed,
        roomType: 10,
        status: {
          notIn: [CourseStatus.CANCELLED, CourseStatus.FINISHED],
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    if (courses.length === 0) {
      return NextResponse.json({ error: "errPasscodeNotFound" }, { status: 404 });
    }

    // Return the matching course ID
    return NextResponse.json({ success: true, courseId: courses[0].id });
  } catch (error) {
    console.error("search-by-passcode error:", error);
    return NextResponse.json({ error: "搜索课程失败，请稍后重试" }, { status: 500 });
  }
}
