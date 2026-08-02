import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { POST as controlRecording } from "@/app/api/courses/[id]/recording/route";
import { resolveCoursewareAccess } from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const identity = await getSessionFromRequest(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { sessionId } = await context.params;
  const lesson = await prisma.courseSession.findUnique({
    where: { id: sessionId },
    select: { courseId: true },
  });
  if (!lesson) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const access = await resolveCoursewareAccess(
    identity,
    lesson.courseId,
    sessionId,
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const recordings = await prisma.classroomRecording.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    recordings: recordings.map((recording, index) => ({
      id: recording.id,
      segment: index + 1,
      provider: recording.provider,
      status: recording.status,
      mode: recording.mode,
      fallbackFrom: recording.fallbackFrom,
      startedAt: recording.startedAt?.toISOString() ?? null,
      stoppedAt: recording.stoppedAt?.toISOString() ?? null,
      playbackFormat: recording.playbackFormat,
      playbackUrl: recording.playbackObjectKey
        ? `/api/sessions/${encodeURIComponent(sessionId)}/recordings/${encodeURIComponent(recording.id)}/play`
        : null,
      errorMessage: access.teaching ? recording.errorMessage : null,
      failureStage: access.teaching ? recording.failureStage : null,
    })),
  });
}

export async function POST(request: NextRequest, context: Context) {
  const { sessionId } = await context.params;
  return controlRecording(request, {
    params: Promise.resolve({ id: sessionId }),
  });
}
