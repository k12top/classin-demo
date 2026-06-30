/**
 * Verify if a user has access to a specific course
 * GET /api/courses/:id/verify-access
 * Returns: { allowed, role, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { resolveCourseAccess, courseIdToRoomUuid } from "@/lib/course-access";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { allowed: false, role: null, reason: "未登录" },
      { status: 401 }
    );
  }

  const { id: courseId } = await params;
  const shareAccess = request.nextUrl.searchParams.get("shareAccess");
  const access = await resolveCourseAccess(courseId, session.userId, {
    shareAccessToken: shareAccess,
  });

  if (!access.ok) {
    const status = access.httpStatus === 403 ? 200 : access.httpStatus;
    return NextResponse.json(
      {
        allowed: false,
        role: null,
        reason: access.reason,
        code: access.code,
      },
      { status }
    );
  }

  const roomUuid = courseIdToRoomUuid(courseId);
  const qs = new URLSearchParams({
    roomUuid,
    roomType: String(access.roomType),
    roomName: access.roomName,
    courseId,
  });
  if (shareAccess) {
    qs.set("shareAccess", shareAccess);
  }
  const classroomUrl = `/classroom?${qs.toString()}`;

  return NextResponse.json(
    {
      allowed: true,
      role: access.role,
      courseInfo: {
        name: access.roomName,
        roomType: access.roomType,
        teacherName: access.teacherName,
      },
      classroomUrl,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    }
  );
}
