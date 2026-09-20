import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";
import { POST as controlRecording } from "@/app/api/courses/[id]/recording/route";
import { resolveCoursewareAccess } from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { reconcileRecordingAttempt } from "@/lib/classroom/server/recording-orchestrator";

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
  const pending = recordings.filter((recording) =>
    ["stopping", "processing"].includes(recording.status),
  );
  if (pending.length) {
    // Agora may expose its final file list shortly after stop. Reconcile on
    // playback reads too, so a newly ended lesson converges without waiting
    // for another class or a server restart.
    after(async () => {
      await Promise.allSettled(
        pending.map((recording) => reconcileRecordingAttempt(recording.id)),
      );
    });
  }
  return NextResponse.json({
    refreshAfterMs: pending.length ? 2_500 : null,
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
