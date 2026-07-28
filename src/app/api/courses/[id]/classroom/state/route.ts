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

  await touchClassroomMember(
    courseId,
    resolved.session,
    resolved.access.role,
  );
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { roomType: true },
  });
  const mode = classroomModePolicy(course?.roomType ?? 4);
  const [runtimeSnapshot, courseware, captions, spaces, questions] = await Promise.all([
    getClassroomRuntimeSnapshot(courseId),
    getClassroomCourseware(courseId, resolved.access.role),
    getClassroomCaptions(courseId),
    mode.allowBreakouts
      ? getClassroomSpaces({
          courseId,
          viewerId: resolved.session.userId,
          role: resolved.access.role,
        })
      : Promise.resolve([]),
    mode.showPublicQuestions
      ? getClassroomQuestions({
          courseId,
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
