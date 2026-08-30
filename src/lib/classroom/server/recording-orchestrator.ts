import "server-only";

import type { ClassroomRecording, Prisma } from "@prisma/client";
import { classroomMediaProfile } from "@/lib/classroom/config";
import { shouldRecoverRecording } from "@/lib/classroom/recording-continuity";
import { appendRecordingProviderState } from "@/lib/classroom/recording-provider-state";
import { getRecordingProvider } from "@/lib/classroom/server/provider-factory";
import {
  createRecorderPageUrl,
  isRecorderPageConfigured,
} from "@/lib/classroom/server/recorder-token";
import { courseIdToRoomUuid } from "@/lib/course-room";
import { CourseStatus } from "@/lib/course-status";
import { prisma } from "@/lib/db";

const ACTIVE_RECORDING_STATUSES = ["starting", "recording", "stopping"];
const RECONCILABLE_RECORDING_STATUSES = [
  "starting",
  "recording",
  "stopping",
  "processing",
];
const MAX_PROVIDER_RETRIES = 3;
const PROVIDER_TRANSITION_LEASE_MS = 45_000;
const PROVIDER_QUERY_INTERVAL_MS = 5_000;
const RECORDING_START_CONFIRMATION_TIMEOUT_MS = 90_000;
// Query at 5, 10 and 15 seconds after Shengwang returns the SID. If the
// request worker exits, the persisted SID is picked up by the minute cron.
const RECORDING_START_CONFIRMATION_DELAYS_MS = [5_000, 5_000, 5_000] as const;

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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.slice(0, 1000) : fallback;
}

function playbackFormat(value: string | null | undefined) {
  if (value === "mp4" || value === "hls") return value;
  return null;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function confirmRecordingStart(recordingId: string) {
  const recording = await prisma.classroomRecording.findUnique({
    where: { id: recordingId },
  });
  if (!recording || recording.status !== "starting") return recording;
  if (
    !recording.resourceId ||
    !recording.providerSessionId ||
    recording.recorderUserId === "pending"
  ) {
    return recording;
  }

  const startedAt = recording.startedAt || recording.createdAt;
  const confirmationExpired =
    Date.now() - startedAt.getTime() >= RECORDING_START_CONFIRMATION_TIMEOUT_MS;
  const provider = getRecordingProvider(recording.provider);
  try {
    const queried = await provider.query({
      channelName: recording.channelName,
      recorderUserId: recording.recorderUserId,
      resourceId: recording.resourceId,
      providerSessionId: recording.providerSessionId,
      providerState: providerStateRecord(recording.providerState),
    });
    const nextProviderState = appendRecordingProviderState(
      recording.providerState,
      "lastQuery",
      queried.providerState,
    );
    await prisma.classroomRecording.updateMany({
      where: { id: recording.id, status: "starting" },
      data: queried.active
        ? {
            status: "recording",
            providerState: inputJson(nextProviderState),
            files: queried.files.length ? inputJson(queried.files) : undefined,
            lastProviderCheckAt: new Date(),
            errorMessage: null,
            failureStage: null,
          }
        : confirmationExpired
          ? {
              status: "failed",
              providerState: inputJson(nextProviderState),
              files: queried.files.length ? inputJson(queried.files) : undefined,
              lastProviderCheckAt: new Date(),
              startRetryCount: { increment: 1 },
              retryCount: { increment: 1 },
              failureStage: "start",
              errorMessage:
                "Cloud recorder did not reach an active state within 90 seconds",
            }
          : {
              providerState: inputJson(nextProviderState),
              files: queried.files.length ? inputJson(queried.files) : undefined,
              lastProviderCheckAt: new Date(),
              errorMessage: "Waiting for cloud recorder startup confirmation",
              failureStage: null,
            },
    });
  } catch (error) {
    await prisma.classroomRecording.updateMany({
      where: { id: recording.id, status: "starting" },
      data: confirmationExpired
        ? {
            status: "failed",
            lastProviderCheckAt: new Date(),
            startRetryCount: { increment: 1 },
            retryCount: { increment: 1 },
            failureStage: "start",
            errorMessage: errorMessage(
              error,
              "Cloud recorder startup confirmation timed out",
            ),
          }
        : {
            lastProviderCheckAt: new Date(),
            errorMessage: errorMessage(
              error,
              "Cloud recorder startup confirmation is pending",
            ),
          },
    });
  }
  return prisma.classroomRecording.findUnique({ where: { id: recordingId } });
}

export async function requestRecordingStart(
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
    lesson.status === CourseStatus.AFTER_CLASS ||
    lesson.status === CourseStatus.FINISHED ||
    lesson.status === CourseStatus.CANCELLED
  ) {
    throw new Error("Recording cannot start after a lesson has ended");
  }
  const latest = lesson.recordings[0];
  if (latest && ACTIVE_RECORDING_STATUSES.includes(latest.status)) return latest;

  const provider = getRecordingProvider(lesson.recordingProvider);
  if (!provider.isConfigured()) {
    throw new Error("Cloud recording is not configured");
  }

  const previousRetries = shouldRecoverRecording(latest, MAX_PROVIDER_RETRIES)
    ? latest.retryCount
    : 0;
  if (
    latest?.status === "failed" &&
    latest.failureStage !== "stop" &&
    latest.retryCount >= MAX_PROVIDER_RETRIES
  ) {
    throw new Error("Cloud recording start retry limit reached");
  }

  return prisma.classroomRecording.create({
    data: {
      courseId: lesson.courseId,
      sessionId: lesson.id,
      provider: provider.name,
      channelName: courseIdToRoomUuid(lesson.id, lesson.roomUuid),
      recorderUserId: "pending",
      status: "starting",
      mode: isRecorderPageConfigured() ? "web" : "mix",
      fallbackFrom: isRecorderPageConfigured() ? null : "web",
      retryCount: previousRetries,
      startRetryCount:
        latest?.failureStage === "start" ? latest.startRetryCount : 0,
      errorMessage: null,
      failureStage: null,
    },
  });
}

export async function processRecordingStart(recordingId: string) {
  const claimedAt = new Date();
  const claimed = await prisma.classroomRecording.updateMany({
    where: {
      id: recordingId,
      status: "starting",
      OR: [
        { lastProviderCheckAt: null },
        {
          lastProviderCheckAt: {
            lt: new Date(claimedAt.getTime() - PROVIDER_TRANSITION_LEASE_MS),
          },
        },
      ],
    },
    data: { lastProviderCheckAt: claimedAt },
  });
  if (!claimed.count) {
    return prisma.classroomRecording.findUnique({ where: { id: recordingId } });
  }
  const recording = await prisma.classroomRecording.findUnique({
    where: { id: recordingId },
    include: { session: true },
  });
  if (!recording || recording.status !== "starting") return recording;

  // A previous worker may have persisted the provider SID and exited before
  // confirming it. Never call start twice for the same recording row.
  if (
    recording.resourceId &&
    recording.providerSessionId &&
    recording.recorderUserId !== "pending"
  ) {
    return confirmRecordingStart(recording.id);
  }

  const provider = getRecordingProvider(recording.provider);
  let started:
    | Awaited<ReturnType<(typeof provider)["start"]>>
    | null = null;
  try {
    const pageUrl =
      recording.mode === "web"
        ? await createRecorderPageUrl(recording.sessionId)
        : null;
    started = await provider.start({
      recordingId: recording.id,
      courseId: recording.sessionId,
      channelName: recording.channelName,
      mediaProfile: classroomMediaProfile,
      pageUrl,
    });
    const claimed = await prisma.classroomRecording.updateMany({
      where: { id: recording.id, status: "starting" },
      data: {
        recorderUserId: started.recorderUserId,
        resourceId: started.resourceId,
        providerSessionId: started.providerSessionId,
        providerState: inputJson(started.providerState),
        // A SID only means that the start API accepted the request. Keep the
        // visible status transitional until query reports status 4 or 5.
        status: "starting",
        mode: started.mode,
        fallbackFrom: started.fallbackFrom || (!pageUrl ? "web" : null),
        startedAt: new Date(),
        lastProviderCheckAt: new Date(),
        errorMessage: null,
        failureStage: null,
      },
    });

    // A stop request may win while acquire/start is in flight. In that case
    // immediately stop the newly-created provider session instead of reviving
    // the UI back to REC.
    if (claimed.count === 0) {
      await provider
        .stop({
          channelName: recording.channelName,
          recorderUserId: started.recorderUserId,
          resourceId: started.resourceId,
          providerSessionId: started.providerSessionId,
          providerState: started.providerState,
        })
        .catch((error) => {
          console.error("[classroom:recording] cancelled start cleanup failed", {
            recordingId,
            error: errorMessage(error, "Provider cleanup failed"),
          });
        });
    }
  } catch (error) {
    await prisma.classroomRecording.updateMany({
      where: { id: recording.id, status: "starting" },
      data: {
        status: "failed",
        startRetryCount: { increment: 1 },
        retryCount: { increment: 1 },
        failureStage: "start",
        errorMessage: errorMessage(error, "Recording start failed"),
      },
    });
    throw error;
  }

  if (!started) {
    return prisma.classroomRecording.findUnique({ where: { id: recordingId } });
  }
  for (const delay of RECORDING_START_CONFIRMATION_DELAYS_MS) {
    await wait(delay);
    const confirmed = await confirmRecordingStart(recording.id);
    if (!confirmed || confirmed.status !== "starting") return confirmed;
  }
  return prisma.classroomRecording.findUnique({ where: { id: recordingId } });
}

/** Compatibility wrapper used by older server paths. */
export async function startRecordingForCourse(
  courseId: string,
  sessionId = courseId,
) {
  const requested = await requestRecordingStart(courseId, sessionId);
  if (requested.status === "starting") {
    await processRecordingStart(requested.id);
  }
  return prisma.classroomRecording.findUniqueOrThrow({
    where: { id: requested.id },
  });
}

export async function requestRecordingStop(recording: ClassroomRecording) {
  if (["completed", "failed", "processing"].includes(recording.status)) {
    return recording;
  }
  await prisma.classroomRecording.updateMany({
    where: {
      id: recording.id,
      status: { in: ["starting", "recording", "stopping"] },
    },
    data: {
      status: "stopping",
      stopRequestedAt: recording.stopRequestedAt || new Date(),
      lastProviderCheckAt: null,
      errorMessage: null,
      failureStage: null,
    },
  });
  return prisma.classroomRecording.findUniqueOrThrow({
    where: { id: recording.id },
  });
}

export async function processRecordingStop(recordingId: string) {
  const claimedAt = new Date();
  const claimed = await prisma.classroomRecording.updateMany({
    where: {
      id: recordingId,
      status: "stopping",
      OR: [
        { lastProviderCheckAt: null },
        {
          lastProviderCheckAt: {
            lt: new Date(claimedAt.getTime() - PROVIDER_TRANSITION_LEASE_MS),
          },
        },
      ],
    },
    data: { lastProviderCheckAt: claimedAt },
  });
  if (!claimed.count) {
    return prisma.classroomRecording.findUnique({ where: { id: recordingId } });
  }
  const recording = await prisma.classroomRecording.findUnique({
    where: { id: recordingId },
  });
  if (!recording || recording.status !== "stopping") return recording;

  if (
    !recording.resourceId ||
    !recording.providerSessionId ||
    recording.recorderUserId === "pending"
  ) {
    await prisma.classroomRecording.updateMany({
      where: { id: recording.id, status: "stopping" },
      data: {
        status: "completed",
        stoppedAt: new Date(),
        errorMessage: null,
        failureStage: null,
      },
    });
    return prisma.classroomRecording.findUnique({
      where: { id: recording.id },
    });
  }

  try {
    const provider = getRecordingProvider(recording.provider);
    const stopped = await provider.stop({
      channelName: recording.channelName,
      recorderUserId: recording.recorderUserId,
      resourceId: recording.resourceId,
      providerSessionId: recording.providerSessionId,
      providerState: providerStateRecord(recording.providerState),
    });
    await prisma.classroomRecording.updateMany({
      where: { id: recording.id, status: "stopping" },
      data: {
        status: stopped.playbackObjectKey ? "completed" : "processing",
        playbackObjectKey: stopped.playbackObjectKey,
        playbackFormat: stopped.playbackFormat,
        files: inputJson(stopped.files),
        providerState: inputJson(
          appendRecordingProviderState(
            recording.providerState,
            "lastStop",
            stopped.providerState,
          ),
        ),
        lastProviderCheckAt: new Date(),
        stoppedAt: new Date(),
        errorMessage: null,
        failureStage: null,
      },
    });
    return prisma.classroomRecording.findUnique({
      where: { id: recording.id },
    });
  } catch (error) {
    const nextRetryCount = recording.stopRetryCount + 1;
    await prisma.classroomRecording.updateMany({
      where: { id: recording.id, status: "stopping" },
      data: {
        status:
          nextRetryCount >= MAX_PROVIDER_RETRIES ? "failed" : "stopping",
        stopRetryCount: nextRetryCount,
        failureStage: "stop",
        errorMessage: errorMessage(error, "Recording stop failed"),
      },
    });
    throw error;
  }
}

export async function reconcileRecordingAttempt(recordingId: string) {
  const recording = await prisma.classroomRecording.findUnique({
    where: { id: recordingId },
  });
  if (!recording) return null;
  if (recording.status === "starting") return processRecordingStart(recording.id);
  if (recording.status === "stopping") return processRecordingStop(recording.id);
  if (!["recording", "processing"].includes(recording.status)) return recording;
  if (!recording.resourceId || !recording.providerSessionId) return recording;

  const checkedAt = new Date();
  const claimed = await prisma.classroomRecording.updateMany({
    where: {
      id: recording.id,
      status: recording.status,
      OR: [
        { lastProviderCheckAt: null },
        {
          lastProviderCheckAt: {
            lt: new Date(checkedAt.getTime() - PROVIDER_QUERY_INTERVAL_MS),
          },
        },
      ],
    },
    data: { lastProviderCheckAt: checkedAt },
  });
  if (!claimed.count) {
    return prisma.classroomRecording.findUnique({
      where: { id: recording.id },
    });
  }

  const provider = getRecordingProvider(recording.provider);
  const queried = await provider.query({
    channelName: recording.channelName,
    recorderUserId: recording.recorderUserId,
    resourceId: recording.resourceId,
    providerSessionId: recording.providerSessionId,
    providerState: providerStateRecord(recording.providerState),
  });
  const objectKey = queried.playbackObjectKey || recording.playbackObjectKey;
  const format = playbackFormat(queried.playbackFormat || recording.playbackFormat);
  const stoppedUnexpectedly =
    !queried.active &&
    !objectKey &&
    !recording.stopRequestedAt &&
    recording.status === "recording";
  await prisma.classroomRecording.updateMany({
    where: {
      id: recording.id,
      status: { in: ["recording", "processing"] },
    },
    data: {
      providerState: inputJson(
        appendRecordingProviderState(
          recording.providerState,
          "lastQuery",
          queried.providerState,
        ),
      ),
      files: queried.files.length ? inputJson(queried.files) : undefined,
      playbackObjectKey: objectKey,
      playbackFormat: format,
      lastProviderCheckAt: new Date(),
      status: stoppedUnexpectedly
        ? "failed"
        : queried.active
          ? recording.status === "processing"
            ? "processing"
            : "recording"
          : objectKey
            ? "completed"
            : "processing",
      ...(stoppedUnexpectedly
        ? {
            retryCount: { increment: 1 },
            failureStage: "runtime",
            errorMessage:
              "Cloud recorder stopped unexpectedly; recovery has been queued",
          }
        : {}),
      ...(objectKey && !recording.stoppedAt ? { stoppedAt: new Date() } : {}),
    },
  });
  return prisma.classroomRecording.findUnique({
    where: { id: recording.id },
  });
}

export async function stopRecordingAttempt(recording: ClassroomRecording) {
  const requested = await requestRecordingStop(recording);
  if (requested.status === "stopping") {
    await processRecordingStop(requested.id);
  }
  return prisma.classroomRecording.findUniqueOrThrow({
    where: { id: recording.id },
  });
}

export async function stopActiveRecordingsForCourse(
  courseId: string,
  sessionId?: string,
): Promise<number> {
  const recordings = await prisma.classroomRecording.findMany({
    where: {
      courseId,
      ...(sessionId ? { sessionId } : {}),
      status: { in: ["starting", "recording", "stopping"] },
    },
  });
  const failures: unknown[] = [];
  for (const recording of recordings) {
    try {
      const requested = await requestRecordingStop(recording);
      await processRecordingStop(requested.id);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(
      failures,
      `Failed to stop ${failures.length} recording(s) for course ${courseId}`,
    );
  }
  return recordings.length;
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
          },
        },
      },
    },
  });
  let started = 0;
  for (const runtime of runtimes) {
    const latest = runtime.session.recordings[0];
    if (
      !getRecordingProvider(runtime.session.recordingProvider).isConfigured() ||
      (latest && !shouldRecoverRecording(latest, MAX_PROVIDER_RETRIES))
    ) {
      continue;
    }
    try {
      const requested = await requestRecordingStart(
        runtime.courseId,
        runtime.sessionId,
      );
      await processRecordingStart(requested.id);
      started += 1;
    } catch (error) {
      console.error("[classroom:recording] retry failed", {
        courseId: runtime.courseId,
        sessionId: runtime.sessionId,
        error: errorMessage(error, "Recording retry failed"),
      });
    }
  }
  return started;
}

/**
 * Re-entering a live classroom is another recovery opportunity. The cloud
 * recorder is independent from the teacher's browser, so this only resumes an
 * unexpected provider failure; it never overrides a deliberate stop.
 */
export async function recoverInterruptedRecordingForSession(
  courseId: string,
  sessionId: string,
): Promise<ClassroomRecording | null> {
  const [runtime, lesson] = await Promise.all([
    prisma.classroomRuntime.findFirst({
      where: { courseId, sessionId },
      select: { status: true },
    }),
    prisma.courseSession.findFirst({
      where: { id: sessionId, courseId },
      include: {
        recordings: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);
  const latest = lesson?.recordings[0];
  if (
    runtime?.status !== "live" ||
    !lesson ||
    !getRecordingProvider(lesson.recordingProvider).isConfigured() ||
    !shouldRecoverRecording(latest, MAX_PROVIDER_RETRIES)
  ) {
    return null;
  }

  const requested = await requestRecordingStart(courseId, sessionId);
  if (requested.status === "starting") {
    await processRecordingStart(requested.id);
  }
  return prisma.classroomRecording.findUnique({ where: { id: requested.id } });
}

export async function reconcilePendingRecordings(): Promise<number> {
  const pending = await prisma.classroomRecording.findMany({
    where: { status: { in: RECONCILABLE_RECORDING_STATUSES } },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  let reconciled = 0;
  for (const recording of pending) {
    try {
      await reconcileRecordingAttempt(recording.id);
      reconciled += 1;
    } catch (error) {
      console.error("[classroom:recording] reconciliation failed", {
        recordingId: recording.id,
        status: recording.status,
        error: errorMessage(error, "Recording reconciliation failed"),
      });
    }
  }
  return reconciled;
}
