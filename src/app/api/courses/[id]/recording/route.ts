import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  ClassroomProviderConfigurationError,
  ClassroomProviderRequestError,
} from "@/lib/classroom/server/errors";
import { getRecordingProvider } from "@/lib/classroom/server/provider-factory";
import {
  startRecordingForCourse,
  stopRecordingAttempt,
} from "@/lib/classroom/server/recording-orchestrator";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { userCanTeachCourse } from "@/lib/course-teacher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function teacherCourse(request: NextRequest, courseId: string) {
  const session = await getSessionFromRequest(request);
  if (!session) return { error: "Unauthorized", status: 401 } as const;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      teachers: { select: { teacherId: true } },
      recordings: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!course) return { error: "Course not found", status: 404 } as const;
  if (!userCanTeachCourse(course, [session.userId, session.name])) {
    return { error: "Forbidden", status: 403 } as const;
  }

  return { session, course } as const;
}

function publicRecording(recording: {
  id: string;
  provider: string;
  status: string;
  startedAt: Date | null;
  stoppedAt: Date | null;
  errorMessage: string | null;
  mode: string;
  fallbackFrom: string | null;
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

  const latest = resolved.course.recordings[0];
  if (!latest) {
    return NextResponse.json({
      enabled: getRecordingProvider(
        resolved.course.recordingProvider,
      ).isConfigured(),
      recording: null,
    });
  }

  let providerState: unknown = latest.providerState;
  if (
    latest.status === "recording" &&
    latest.resourceId &&
    latest.providerSessionId
  ) {
    try {
      const provider = getRecordingProvider(latest.provider);
      const queried = await provider.query({
        channelName: latest.channelName,
        recorderUserId: latest.recorderUserId,
        resourceId: latest.resourceId,
        providerSessionId: latest.providerSessionId,
        providerState:
          latest.providerState &&
          typeof latest.providerState === "object" &&
          !Array.isArray(latest.providerState)
            ? (latest.providerState as Record<string, unknown>)
            : null,
      });
      providerState = queried.providerState;
      await prisma.classroomRecording.update({
        where: { id: latest.id },
        data: { providerState: inputJson(queried.providerState) },
      });
    } catch (error) {
      console.warn("[classroom:recording] query failed", {
        recordingId: latest.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    enabled: getRecordingProvider(
      resolved.course.recordingProvider,
    ).isConfigured(),
    recording: {
      ...publicRecording(latest),
      providerState,
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

  const { course } = resolved;
  const latest = course.recordings[0];
  try {
    if (action === "start") {
      const recording = await startRecordingForCourse(course.id);
      return NextResponse.json(
        { recording: publicRecording(recording) },
        { status: 201 },
      );
    }

    if (!latest || latest.status === "completed") {
      return NextResponse.json({
        recording: latest ? publicRecording(latest) : null,
      });
    }
    if (
      !latest.resourceId ||
      !latest.providerSessionId ||
      latest.recorderUserId === "pending"
    ) {
      return NextResponse.json(
        { error: "录制尚未完成启动，暂时不能停止" },
        { status: 409 },
      );
    }

    const recording = await stopRecordingAttempt(latest);
    return NextResponse.json({ recording: publicRecording(recording) });
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
    return NextResponse.json(
      { error: "云端录制操作失败" },
      { status: 500 },
    );
  }
}
