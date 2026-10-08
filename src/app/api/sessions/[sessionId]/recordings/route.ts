import type { NextRequest } from "next/server";
import { after, NextResponse } from "next/server";
import { POST as controlRecording } from "@/app/api/courses/[id]/recording/route";
import { resolveCoursewareAccess } from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { reconcileRecordingAttempt } from "@/lib/classroom/server/recording-orchestrator";
import { recordingPlaybackAssets } from "@/lib/classroom/recording-playback";
import { recordingNeedsReconciliation } from "@/lib/classroom/recording-reconciliation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";
export const maxDuration = 120;

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
    recordingNeedsReconciliation(recording.status),
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
    refreshAfterMs: pending.length ? 5_000 : null,
    recordings: recordings.flatMap((recording): Array<{
      id: string; segment: number; provider: string; status: string;
      mode: string; fallbackFrom: string | null; startedAt: string | null;
      stoppedAt: string | null; playbackFormat: string | null;
      playbackUrl: string | null; errorMessage: string | null;
      failureStage: string | null;
    }> => {
      const state = recording.providerState;
      const prefix = state && typeof state === "object" && !Array.isArray(state) &&
        Array.isArray(state.fileNamePrefix)
        ? state.fileNamePrefix.filter((part): part is string => typeof part === "string")
        : [];
      const assets = recording.status === "completed"
        ? recordingPlaybackAssets(recording.files, prefix, recording.playbackObjectKey, recording.playbackFormat)
        : [];
      if (!assets.length) return [{
        id: recording.id,
        segment: 0,
        provider: recording.provider,
        status: recording.status,
        mode: recording.mode,
        fallbackFrom: recording.fallbackFrom,
        startedAt: recording.startedAt?.toISOString() ?? null,
        stoppedAt: recording.stoppedAt?.toISOString() ?? null,
        playbackFormat: recording.playbackFormat,
        playbackUrl: null,
        errorMessage: access.teaching ? recording.errorMessage : null,
        failureStage: access.teaching ? recording.failureStage : null,
      }];
      return assets.map((asset, index) => ({
        id: `${recording.id}:${index}`,
        segment: 0,
        provider: recording.provider,
        status: recording.status,
        mode: recording.mode,
        fallbackFrom: recording.fallbackFrom,
        // A single attempt can contain several MP4 files. Its wall-clock
        // bounds cannot locate a caption within one particular file.
        startedAt: assets.length === 1 ? recording.startedAt?.toISOString() ?? null : null,
        stoppedAt: assets.length === 1 ? recording.stoppedAt?.toISOString() ?? null : null,
        playbackFormat: asset.format,
        playbackUrl: `/api/sessions/${encodeURIComponent(sessionId)}/recordings/${encodeURIComponent(recording.id)}/play?asset=${encodeURIComponent(asset.objectKey)}`,
        errorMessage: access.teaching ? recording.errorMessage : null,
        failureStage: access.teaching ? recording.failureStage : null,
      }));
    }).map((recording, index) => ({ ...recording, segment: index + 1 })),
  });
}

export async function POST(request: NextRequest, context: Context) {
  const { sessionId } = await context.params;
  return controlRecording(request, {
    params: Promise.resolve({ id: sessionId }),
  });
}
