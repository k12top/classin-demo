import { NextRequest, NextResponse } from "next/server";
import {
  getClassroomCourseware,
  getClassroomRuntimeSnapshot,
  touchClassroomMember,
} from "@/lib/classroom/server/runtime";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { getClassroomCaptions } from "@/lib/classroom/server/captions";
import { getClassroomQuestions } from "@/lib/classroom/server/questions";
import { getClassroomSpaces } from "@/lib/classroom/server/spaces";
import { classroomModePolicy } from "@/lib/classroom/mode";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  const shareAccess = request.nextUrl.searchParams.get("shareAccess");
  const resolved = await resolveClassroomRequestAccess(
    request,
    courseId,
    shareAccess,
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, code: resolved.code },
      { status: resolved.status },
    );
  }
  const resolvedCourseId = resolved.access.courseId;
  const sessionId = resolved.access.sessionId;

  await touchClassroomMember(
    resolvedCourseId,
    resolved.session,
    resolved.access.role,
    undefined,
    sessionId,
  );
  const lesson = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { roomType: true },
  });
  const mode = classroomModePolicy(lesson?.roomType ?? 4);
  const [runtimeSnapshot, courseware, captions, spaces, questions] = await Promise.all([
    getClassroomRuntimeSnapshot(resolvedCourseId, sessionId),
    getClassroomCourseware(resolvedCourseId, resolved.access.role, sessionId),
    getClassroomCaptions(resolvedCourseId, 100, sessionId),
    mode.allowBreakouts
      ? getClassroomSpaces({
          courseId: resolvedCourseId,
          sessionId,
          viewerId: resolved.session.userId,
          role: resolved.access.role,
        })
      : Promise.resolve([]),
    mode.showPublicQuestions
      ? getClassroomQuestions({
          courseId: resolvedCourseId,
          sessionId,
          viewerId: resolved.session.userId,
          role: resolved.access.role,
        })
      : Promise.resolve([]),
  ]);
  return NextResponse.json(
    { runtime: runtimeSnapshot, courseware, captions, spaces, questions },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
