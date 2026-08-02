import { NextRequest, NextResponse } from "next/server";
import {
  getClassroomCourseware,
  getClassroomEngagementSnapshot,
  getClassroomRuntimeSnapshot,
  touchClassroomMember,
} from "@/lib/classroom/server/runtime";
import { resolveClassroomRequestAccess } from "@/lib/classroom/server/request-access";
import { getClassroomCaptions } from "@/lib/classroom/server/captions";
import { getClassroomQuestions } from "@/lib/classroom/server/questions";
import { getClassroomSpaces } from "@/lib/classroom/server/spaces";
import { classroomModePolicy } from "@/lib/classroom/mode";
import { getRecordingProvider } from "@/lib/classroom/server/provider-factory";
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
    select: {
      roomType: true,
      recordingProvider: true,
      recordings: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          mode: true,
          fallbackFrom: true,
        },
      },
    },
  });
  const mode = classroomModePolicy(lesson?.roomType ?? 4);
  const [runtimeSnapshot, engagement, courseware, captions, spaces, questions] = await Promise.all([
    getClassroomRuntimeSnapshot(resolvedCourseId, sessionId, {
      ensure: false,
    }),
    getClassroomEngagementSnapshot(sessionId),
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
  const recordingProvider = getRecordingProvider(
    lesson?.recordingProvider ?? "agora",
  );
  const latestRecording = lesson?.recordings[0];
  const recording = {
    enabled: recordingProvider.isConfigured(),
    status: latestRecording?.status ?? null,
    mode:
      latestRecording?.mode === "web"
        ? ("web" as const)
        : latestRecording?.mode === "mix"
          ? ("mix" as const)
          : null,
    fallbackFrom: latestRecording?.fallbackFrom ?? null,
  };

  return NextResponse.json(
    {
      runtime: runtimeSnapshot,
      engagement,
      courseware,
      captions,
      spaces,
      questions,
      recording,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
