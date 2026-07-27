import { NextRequest, NextResponse } from "next/server";
import {
  ClassroomProviderConfigurationError,
  ClassroomProviderRequestError,
} from "@/lib/classroom/providers/agora/server";
import { classroomMediaProfile } from "@/lib/classroom/config";
import { getRecordingProvider } from "@/lib/classroom/server/provider-factory";
import { courseIdToRoomUuid } from "@/lib/course-room";
import { CourseStatus } from "@/lib/course-status";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { userCanTeachCourse } from "@/lib/course-teacher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIVE_RECORDING_STATUSES = ["starting", "recording", "stopping"];

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
}) {
  return {
    id: recording.id,
    provider: recording.provider,
    status: recording.status,
    startedAt: recording.startedAt?.toISOString() ?? null,
    stoppedAt: recording.stoppedAt?.toISOString() ?? null,
    errorMessage: recording.errorMessage,
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

  let providerState = latest.providerState;
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
        data: { providerState: queried.providerState },
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
  const provider = getRecordingProvider(
    action === "stop" && latest ? latest.provider : course.recordingProvider,
  );

  try {
    if (action === "start") {
      if (
        course.status === CourseStatus.FINISHED ||
        course.status === CourseStatus.CANCELLED
      ) {
        return NextResponse.json(
          { error: "已结束或已取消的课程不能开始录制" },
          { status: 409 },
        );
      }
      if (
        latest &&
        ACTIVE_RECORDING_STATUSES.includes(latest.status)
      ) {
        return NextResponse.json({
          recording: publicRecording(latest),
        });
      }
      if (!provider.isConfigured()) {
        return NextResponse.json(
          {
            error: "云端录制尚未配置完成",
            code: "recording_not_configured",
          },
          { status: 503 },
        );
      }

      const channelName = courseIdToRoomUuid(course.id, course.roomUuid);
      const created = await prisma.classroomRecording.create({
        data: {
          courseId: course.id,
          provider: provider.name,
          channelName,
          recorderUserId: "pending",
          status: "starting",
        },
      });

      try {
        const started = await provider.start({
          recordingId: created.id,
          courseId: course.id,
          channelName,
          mediaProfile: classroomMediaProfile,
        });
        const recording = await prisma.classroomRecording.update({
          where: { id: created.id },
          data: {
            recorderUserId: started.recorderUserId,
            resourceId: started.resourceId,
            providerSessionId: started.providerSessionId,
            providerState: started.providerState,
            status: "recording",
            startedAt: new Date(),
            errorMessage: null,
          },
        });
        await prisma.course.update({
          where: { id: course.id },
          data: {
            status: CourseStatus.LIVE,
            endedAt: null,
          },
        });
        return NextResponse.json(
          { recording: publicRecording(recording) },
          { status: 201 },
        );
      } catch (error) {
        await prisma.classroomRecording.update({
          where: { id: created.id },
          data: {
            status: "failed",
            errorMessage:
              error instanceof Error ? error.message : "Recording start failed",
          },
        });
        throw error;
      }
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

    await prisma.classroomRecording.update({
      where: { id: latest.id },
      data: { status: "stopping", errorMessage: null },
    });
    try {
      const stopped = await provider.stop({
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
      const recording = await prisma.classroomRecording.update({
        where: { id: latest.id },
        data: {
          status: "completed",
          playbackObjectKey: stopped.playbackObjectKey,
          files: stopped.files,
          providerState: stopped.providerState,
          stoppedAt: new Date(),
          errorMessage: null,
        },
      });
      await prisma.course.update({
        where: { id: course.id },
        data: {
          status: CourseStatus.AFTER_CLASS,
          endedAt: new Date(),
          recordUrl: stopped.playbackObjectKey
            ? `/api/courses/${encodeURIComponent(course.id)}/recording.mp4`
            : undefined,
        },
      });
      return NextResponse.json({ recording: publicRecording(recording) });
    } catch (error) {
      await prisma.classroomRecording.update({
        where: { id: latest.id },
        data: {
          status: "recording",
          errorMessage:
            error instanceof Error ? error.message : "Recording stop failed",
        },
      });
      throw error;
    }
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

