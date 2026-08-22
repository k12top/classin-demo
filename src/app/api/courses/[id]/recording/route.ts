import { after, NextRequest, NextResponse } from "next/server";
import {
  ClassroomProviderConfigurationError,
  ClassroomProviderRequestError,
} from "@/lib/classroom/server/errors";
import { getRecordingProvider } from "@/lib/classroom/server/provider-factory";
import {
  processRecordingStart,
  processRecordingStop,
  reconcileRecordingAttempt,
  requestRecordingStart,
  requestRecordingStop,
} from "@/lib/classroom/server/recording-orchestrator";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { resolveCourseSessionAccess } from "@/lib/course-session-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function teacherCourse(request: NextRequest, courseId: string) {
  const session = await getSessionFromRequest(request);
  if (!session) return { error: "Unauthorized", status: 401 } as const;
  const access = await resolveCourseSessionAccess(courseId, session.userId, {
    userIdAliases: [session.name],
  });
  if (!access.ok) {
    return { error: access.reason, status: access.httpStatus } as const;
  }
  if (access.role !== "teacher") {
    return { error: "Forbidden", status: 403 } as const;
  }
  const lesson = await prisma.courseSession.findUnique({
    where: { id: access.sessionId },
    include: {
      course: true,
      recordings: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!lesson) return { error: "Course session not found", status: 404 } as const;

  return { session, access, course: lesson.course, lesson } as const;
}

function publicRecording(recording: {
  id: string;
  sessionId: string;
  provider: string;
  status: string;
  startedAt: Date | null;
  stoppedAt: Date | null;
  errorMessage: string | null;
  mode: string;
  fallbackFrom: string | null;
  playbackFormat?: string | null;
  playbackObjectKey?: string | null;
  failureStage?: string | null;
}) {
  return {
    id: recording.id,
    provider: recording.provider,
    status: recording.status,
    startedAt: recording.startedAt?.toISOString() ?? null,
    stoppedAt: recording.stoppedAt?.toISOString() ?? null,
    errorMessage: recording.errorMessage,
    mode: recording.mode,
    fallbackFrom: recording.fallbackFrom,
    playbackFormat: recording.playbackFormat ?? null,
    playbackUrl: recording.playbackObjectKey
      ? `/api/sessions/${encodeURIComponent(recording.sessionId)}/recordings/${encodeURIComponent(recording.id)}/play`
      : null,
    failureStage: recording.failureStage ?? null,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resolved = await teacherCourse(request, id);
  if ("error" in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  let latest = resolved.lesson.recordings[0];
  if (!latest) {
    return NextResponse.json({
      enabled: getRecordingProvider(
        resolved.lesson.recordingProvider,
      ).isConfigured(),
      recording: null,
    });
  }

  const shouldReconcile =
    ["starting", "stopping", "processing"].includes(latest.status) ||
    (latest.status === "recording" &&
      (!latest.lastProviderCheckAt ||
        Date.now() - latest.lastProviderCheckAt.getTime() >= 2_000));
  if (shouldReconcile) {
    try {
      latest = (await reconcileRecordingAttempt(latest.id)) || latest;
    } catch (error) {
      console.warn("[classroom:recording] query failed", {
        recordingId: latest.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    enabled: getRecordingProvider(
      resolved.lesson.recordingProvider,
    ).isConfigured(),
    recording: {
      ...publicRecording(latest),
      providerState: latest.providerState,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resolved = await teacherCourse(request, id);
  if ("error" in resolved) {
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
  };
  const action = body.action;
  if (action !== "start" && action !== "stop") {
    return NextResponse.json(
      { error: 'action must be "start" or "stop"' },
      { status: 400 },
    );
  }

  const { course, lesson } = resolved;
  const latest = lesson.recordings[0];
  try {
    if (action === "start") {
      const recording = await requestRecordingStart(course.id, lesson.id);
      after(() => processRecordingStart(recording.id).catch((error) => {
        console.error("[classroom:recording] deferred start failed", {
          recordingId: recording.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }));
      return NextResponse.json(
        { recording: publicRecording(recording) },
        { status: 202 },
      );
    }

    if (!latest || latest.status === "completed") {
      return NextResponse.json({
        recording: latest ? publicRecording(latest) : null,
      });
    }
    const recording = await requestRecordingStop(latest);
    after(() => processRecordingStop(recording.id).catch((error) => {
      console.error("[classroom:recording] deferred stop failed", {
        recordingId: recording.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }));
    return NextResponse.json(
      { recording: publicRecording(recording) },
      { status: 202 },
    );
  } catch (error) {
    console.error("[classroom:recording] action failed", {
      courseId: id,
      action,
      error,
    });
    if (error instanceof ClassroomProviderConfigurationError) {
      return NextResponse.json(
        {
          error: "云端录制配置不完整",
          code: "recording_not_configured",
          missingVariables: error.missingVariables,
        },
        { status: 503 },
      );
    }
    if (error instanceof ClassroomProviderRequestError) {
      return NextResponse.json(
        {
          error: `云端录制请求失败：${error.message}`,
          code: "recording_provider_failed",
        },
        { status: 502 },
      );
    }
    if (
      error instanceof Error &&
      error.message.includes("not configured")
    ) {
      return NextResponse.json(
        { error: "云端录制配置不完整", code: "recording_not_configured" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "云端录制操作失败" },
      { status: 500 },
    );
  }
}
