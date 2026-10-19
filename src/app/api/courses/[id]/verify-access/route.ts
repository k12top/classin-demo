/**
 * Verify if a user has access to a specific course
 * GET /api/courses/:id/verify-access
 * Returns: { allowed, role, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { resolveCourseSessionAccess } from "@/lib/course-session-access";
import { prisma } from "@/lib/db";
import { databaseUnavailableResponse } from "@/lib/database-response";

export const dynamic = "force-dynamic";

async function verifyAccess(
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
  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  if (sessionId && !await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId }, select: { id: true },
  })) {
    return NextResponse.json({ allowed: false, role: null, code: "not_found", reason: "课次不存在" }, { status: 404 });
  }
  const shareAccess = request.nextUrl.searchParams.get("shareAccess");
  const access = await resolveCourseSessionAccess(sessionId || courseId, session.userId, {
    referenceType: sessionId ? "session" : "course",
    shareAccessToken: shareAccess,
    userIdAliases: [session.name],
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

  const qs = new URLSearchParams({
    sessionId: access.sessionId,
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
        roomUuid: access.roomUuid,
        name: access.roomName,
        roomType: access.roomType,
        teacherName: access.teacherName,
        startTime: access.startTime?.toISOString() ?? null,
        endTime: access.endTime?.toISOString() ?? null,
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

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    return await verifyAccess(request, context);
  } catch (error) {
    const response = databaseUnavailableResponse(error, { route: "courses/verify-access", operation: "entry" });
    if (response) return response;
    throw error;
  }
}
