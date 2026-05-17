/**
 * Verify if a user has access to a specific course
 * GET /api/courses/:id/verify-access
 * Returns: { allowed, role, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { resolveCourseAccess } from "@/lib/course-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { allowed: false, role: null, reason: "未登录" },
      { status: 401 }
    );
  }

  const { id: courseId } = await params;
  const access = await resolveCourseAccess(courseId, session.userId);

  if (!access.ok) {
    const status = access.httpStatus === 403 ? 200 : access.httpStatus;
    return NextResponse.json(
      {
        allowed: false,
        role: null,
        reason: access.reason,
      },
      { status }
    );
  }

  return NextResponse.json({
    allowed: true,
    role: access.role,
    courseInfo: {
      name: access.roomName,
      roomType: access.roomType,
      teacherName: access.teacherName,
    },
  });
}
