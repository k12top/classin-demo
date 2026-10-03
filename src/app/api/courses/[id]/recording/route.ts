import { after, NextRequest, NextResponse } from "next/server";
import {
  ClassroomProviderConfigurationError,
  ClassroomProviderRequestError,
} from "@/lib/classroom/server/errors";
import { getRecordingProvider } from "@/lib/classroom/server/provider-factory";
import { canAutoStartRecordingAtStatus } from "@/lib/classroom/recording-start";
import { shouldRecoverRecording } from "@/lib/classroom/recording-continuity";
import {
  processRecordingStart,
  processRecordingStop,
  reconcileRecordingAttempt,
  requestRecordingStart,
  requestRecordingStop,
} from "@/lib/classroom/server/recording-orchestrator";
import { isTransientDatabaseError, prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { resolveCourseSessionAccess } from "@/lib/course-session-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Keep recording control near the current database endpoint. The previous
// iad1 invocation timed out before it could read the recording state.
export const preferredRegion = "sin1";

function databaseUnavailableResponse() {
  return NextResponse.json(
    { error: "数据库暂时无法连接，请稍后重试", code: "database_unavailable" },
    { status: 503, headers: { "Retry-After": "3" } },
  );
}

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
  let resolved: Awaited<ReturnType<typeof teacherCourse>>;
  try {
    resolved = await teacherCourse(request, id);
  } catch (error) {
    if (isTransientDatabaseError(error)) return databaseUnavailableResponse();
    throw error;
  }
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
  let action: unknown = null;
  try {
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
    action = body.action;
    if (action !== "start" && action !== "stop" && action !== "auto-start-whiteboard-ready") {
      return NextResponse.json(
        { error: 'action must be "start", "stop", or "auto-start-whiteboard-ready"' },
        { status: 400 },
      );
    }

    const { course, lesson } = resolved;
    const latest = lesson.recordings[0];
    if (action === "start") {
      const runtimeState = await prisma.classroomRuntime.findUnique({
        where: { sessionId: lesson.id },
        select: { status: true, recordingStartMode: true },
      });
      if (runtimeState?.recordingStartMode === "disabled") {
        return NextResponse.json({ error: "当前课堂设置为不录制，请先修改录制设置" }, { status: 409 });
      }
      if (runtimeState?.status !== "live") {
        return NextResponse.json(
          { error: "开始上课后才能录制" },
          { status: 409 },
        );
      }
    }
    if (action === "auto-start-whiteboard-ready") {
      const runtimeState = await prisma.classroomRuntime.findUnique({
        where: { sessionId: lesson.id },
        select: { status: true, recordingStartMode: true, startedAt: true },
      });
      const previousLessonRun = Boolean(
        runtimeState?.startedAt && latest?.stoppedAt &&
        latest.stoppedAt < runtimeState.startedAt,
      );
      if (
        !runtimeState ||
        !canAutoStartRecordingAtStatus(
          runtimeState.recordingStartMode,
          runtimeState.status,
        ) ||
        (latest && !previousLessonRun && !shouldRecoverRecording(latest, 3))
      ) {
        return NextResponse.json({ recording: latest ? publicRecording(latest) : null });
      }
    }
    if (action === "start" || action === "auto-start-whiteboard-ready") {
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
    if (isTransientDatabaseError(error)) {
      return databaseUnavailableResponse();
    }
    if (error instanceof ClassroomProviderConfigurationError) {
      return NextResponse.json(
        {
          error: "云端录制配置不完整",
          code: "recording_not_configured",
          missingVariables: error.missingVariables,
          configurationIssue: error.message,
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
