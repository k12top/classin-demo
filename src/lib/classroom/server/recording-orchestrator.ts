import "server-only";

import type { ClassroomRecording, Prisma } from "@prisma/client";
import { classroomMediaProfile } from "@/lib/classroom/config";
import { getRecordingProvider } from "@/lib/classroom/server/provider-factory";
import { createRecorderPageUrl } from "@/lib/classroom/server/recorder-token";
import { courseIdToRoomUuid } from "@/lib/course-room";
import { CourseStatus } from "@/lib/course-status";
import { prisma } from "@/lib/db";

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function providerStateRecord(
  value: ClassroomRecording["providerState"],
): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const ACTIVE_RECORDING_STATUSES = ["starting", "recording", "stopping"];

export async function startRecordingForCourse(
  courseId: string,
  sessionId = courseId,
) {
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    include: {
      recordings: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!lesson) throw new Error("Course session not found");
  if (
    lesson.status === CourseStatus.FINISHED ||
    lesson.status === CourseStatus.CANCELLED
  ) {
    throw new Error("Recording cannot start for a finished or cancelled course");
  }
  const latest = lesson.recordings[0];
  if (latest && ACTIVE_RECORDING_STATUSES.includes(latest.status)) {
    return latest;
  }
  const provider = getRecordingProvider(lesson.recordingProvider);
  if (!provider.isConfigured()) {
    throw new Error("Cloud recording is not configured");
  }
  const retryCount =
    latest?.status === "failed" ? Math.min(latest.retryCount + 1, 3) : 0;
  const channelName = courseIdToRoomUuid(lesson.id, lesson.roomUuid);
  const pageUrl = await createRecorderPageUrl(lesson.id);
  const created = await prisma.classroomRecording.create({
    data: {
      courseId: lesson.courseId,
      sessionId: lesson.id,
      provider: provider.name,
      channelName,
      recorderUserId: "pending",
      status: "starting",
      mode: pageUrl ? "web" : "mix",
      fallbackFrom: pageUrl ? null : "web",
      retryCount,
    },
  });
  try {
    const started = await provider.start({
      recordingId: created.id,
      courseId: lesson.id,
      channelName,
      mediaProfile: classroomMediaProfile,
      pageUrl,
    });
    const recording = await prisma.classroomRecording.update({
      where: { id: created.id },
      data: {
        recorderUserId: started.recorderUserId,
        resourceId: started.resourceId,
        providerSessionId: started.providerSessionId,
        providerState: inputJson(started.providerState),
        status: "recording",
        mode: started.mode,
        fallbackFrom:
          started.fallbackFrom || (!pageUrl ? "web" : null),
        startedAt: new Date(),
        errorMessage: null,
      },
    });
    await prisma.courseSession.update({
      where: { id: lesson.id },
      data: { status: CourseStatus.LIVE, endedAt: null },
    });
    return recording;
  } catch (error) {
    await prisma.classroomRecording.update({
      where: { id: created.id },
      data: {
        status: "failed",
        retryCount,
        errorMessage:
          error instanceof Error ? error.message : "Recording start failed",
      },
    });
    throw error;
  }
}

export async function retryFailedLiveRecordings(): Promise<number> {
  const runtimes = await prisma.classroomRuntime.findMany({
    where: { status: "live" },
    select: {
      courseId: true,
      sessionId: true,
      session: {
        select: {
          recordingProvider: true,
          recordings: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, retryCount: true },
          },
        },
      },
    },
  });
  let started = 0;
  for (const runtime of runtimes) {
    if (
      !getRecordingProvider(
        runtime.session.recordingProvider,
      ).isConfigured()
    ) {
      continue;
    }
    const latest = runtime.session.recordings[0];
    if (
      latest &&
      (latest.status !== "failed" || latest.retryCount >= 3)
    ) {
      continue;
    }
    try {
      await startRecordingForCourse(runtime.courseId, runtime.sessionId);
      started += 1;
    } catch (error) {
      console.error("[classroom:recording] retry failed", {
        courseId: runtime.courseId,
        sessionId: runtime.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return started;
}

/**
 * Stop one persisted recording attempt and publish its authenticated playback
 * route. This operation is shared by the teacher action and scheduled cleanup.
 */
export async function stopRecordingAttempt(recording: ClassroomRecording) {
  if (
    !recording.resourceId ||
    !recording.providerSessionId ||
    recording.recorderUserId === "pending"
  ) {
    throw new Error("Recording has not finished starting");
  }

  await prisma.classroomRecording.update({
    where: { id: recording.id },
    data: { status: "stopping", errorMessage: null },
  });

  try {
    const provider = getRecordingProvider(recording.provider);
    const stopped = await provider.stop({
      channelName: recording.channelName,
      recorderUserId: recording.recorderUserId,
      resourceId: recording.resourceId,
      providerSessionId: recording.providerSessionId,
      providerState: providerStateRecord(recording.providerState),
    });
    const completed = await prisma.classroomRecording.update({
      where: { id: recording.id },
      data: {
        status: "completed",
        playbackObjectKey: stopped.playbackObjectKey,
        files: inputJson(stopped.files),
        providerState: inputJson(stopped.providerState),
        stoppedAt: new Date(),
        errorMessage: null,
      },
    });

    if (stopped.playbackObjectKey) {
      await prisma.course.update({
        where: { id: recording.courseId },
        data: {
          recordUrl: `/api/courses/${encodeURIComponent(
            recording.courseId,
          )}/recording.mp4`,
        },
      });
    }
    return completed;
  } catch (error) {
    await prisma.classroomRecording.update({
      where: { id: recording.id },
      data: {
        // Keep it retryable: the recorder may still be running and billing.
        status: "recording",
        errorMessage:
          error instanceof Error ? error.message : "Recording stop failed",
      },
    });
    throw error;
  }
}

/** Stop every recorder attached to a course before rotating or deleting it. */
export async function stopActiveRecordingsForCourse(
  courseId: string,
  sessionId?: string,
): Promise<number> {
  const recordings = await prisma.classroomRecording.findMany({
    where: {
      courseId,
      ...(sessionId ? { sessionId } : {}),
      status: { in: ["recording", "stopping"] },
    },
  });
  const failures: unknown[] = [];

  for (const recording of recordings) {
    try {
      await stopRecordingAttempt(recording);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Failed to stop ${failures.length} recording(s) for course ${courseId}`,
    );
  }
  return recordings.length;
}
