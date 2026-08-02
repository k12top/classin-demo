import "server-only";

import { prisma } from "@/lib/db";
import { courseIdToRoomUuid } from "@/lib/course-room";
import {
  normalizeClassroomLanguage,
  normalizeTargetLanguages,
} from "@/lib/classroom/languages";
import {
  isAgoraTranscriptionConfigured,
  normalizeAgoraTranscriptionStatus,
  queryAgoraTranscription,
  startAgoraTranscription,
  stopAgoraTranscription,
  updateAgoraTranscription,
} from "@/lib/classroom/transcription/agora-stt";
import {
  ensureWordlyRoom,
  isWordlyConfigured,
  isWordlyHealthy,
  stopWordlyRoom,
} from "@/lib/classroom/translation/wordly";
import { ensureClassroomRuntime } from "@/lib/classroom/server/runtime";

export async function stopClassroomTranscription(
  courseId: string,
  sessionId = courseId,
) {
  const runtime = await prisma.classroomRuntime.findUnique({ where: { sessionId } });
  if (!runtime) return;
  const agentId = runtime.transcriptionAgentId;
  await prisma.classroomRuntime.update({
    where: { id: runtime.id },
    data: { transcriptionStatus: "stopping", transcriptionError: null },
  });
  const results = await Promise.allSettled([
    agentId ? stopAgoraTranscription(agentId) : Promise.resolve(),
    runtime.interpretationProvider === "wordly"
      ? stopWordlyRoom(sessionId)
      : Promise.resolve(),
  ]);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  await prisma.classroomRuntime.update({
    where: { id: runtime.id },
    data: {
      transcriptionAgentId: null,
      transcriptionStatus: failure ? "failed" : "stopped",
      transcriptionError: failure
        ? (failure.reason instanceof Error
            ? failure.reason.message
            : String(failure.reason)
          ).slice(0, 1000)
        : null,
      transcriptionLastCheckedAt: new Date(),
    },
  });
}

export async function syncClassroomTranscription(
  courseId: string,
  options: { restart?: boolean; sessionId?: string; retryCount?: number } = {},
) {
  const sessionId = options.sessionId || courseId;
  await ensureClassroomRuntime(courseId, sessionId);
  const lesson = await prisma.courseSession.findFirstOrThrow({
    where: { id: sessionId, courseId },
    include: { classroomRuntime: true, course: { select: { name: true } } },
  });
  const runtime = lesson.classroomRuntime!;
  const attemptRetryCount =
    options.retryCount ?? (options.restart ? 0 : runtime.transcriptionRetryCount);

  if (
    !options.restart &&
    runtime.interpretationEnabled &&
    runtime.status === "live" &&
    runtime.transcriptionStatus === "running" &&
    runtime.transcriptionAgentId
  ) {
    return runtime;
  }

  if (!runtime.interpretationEnabled || runtime.status !== "live") {
    await stopClassroomTranscription(courseId, sessionId);
    return prisma.classroomRuntime.findUniqueOrThrow({ where: { sessionId } });
  }

  const provider = runtime.interpretationProvider === "wordly" ? "wordly" : "shengwang";
  const sourceLanguage = normalizeClassroomLanguage(runtime.sourceLanguage);
  const targetLanguages = normalizeTargetLanguages(
    runtime.targetLanguages,
    sourceLanguage,
    provider === "shengwang" ? 10 : 20,
  );

  try {
    if (!isAgoraTranscriptionConfigured()) {
      throw new Error("Shengwang ASR is not configured. Check AGORA_STT_* and REST credentials.");
    }
    const channelName = courseIdToRoomUuid(lesson.id, lesson.roomUuid);
    if (provider === "wordly") {
      if (!isWordlyConfigured() || !(await isWordlyHealthy())) {
        throw new Error("Wordly is not configured. Set WORDLY_API_URL and WORDLY_INTERNAL_TOKEN.");
      }
      await ensureWordlyRoom({
        courseId: sessionId,
        title: lesson.title || lesson.course.name,
        channelName,
        sourceLanguage,
        targetLanguages,
      });
    } else {
      await stopWordlyRoom(sessionId).catch(() => undefined);
    }

    if (options.restart && runtime.transcriptionAgentId) {
      try {
        const current = await queryAgoraTranscription(
          runtime.transcriptionAgentId,
        );
        const status = normalizeAgoraTranscriptionStatus(current);
        if (["running", "starting", "recovering"].includes(status)) {
          await updateAgoraTranscription(runtime.transcriptionAgentId, {
            sourceLanguage,
            targetLanguages,
            translationProvider: provider,
          });
          return prisma.classroomRuntime.update({
            where: { id: runtime.id },
            data: {
              transcriptionStatus: status,
              transcriptionError: null,
              transcriptionLastCheckedAt: new Date(),
            },
          });
        }
      } catch (error) {
      console.warn("[classroom:captions] live update failed; restarting", {
        courseId,
        sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await stopAgoraTranscription(runtime.transcriptionAgentId).catch(
        () => undefined,
      );
    }
    await prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: {
        transcriptionStatus: "starting",
        transcriptionAgentId: null,
        transcriptionError: null,
        transcriptionRetryCount: attemptRetryCount,
        transcriptionLastCheckedAt: new Date(),
      },
    });
    const started = await startAgoraTranscription({
      courseId: sessionId,
      channelName,
      sourceLanguage,
      targetLanguages,
      translationProvider: provider,
    });
    return prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: {
        transcriptionStatus: started.status,
        transcriptionAgentId: started.agentId,
        transcriptionError: null,
        transcriptionRetryCount: attemptRetryCount,
        transcriptionLastCheckedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start classroom captions";
    await prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: {
        transcriptionStatus: "failed",
        transcriptionAgentId: null,
        transcriptionError: message.slice(0, 1000),
        transcriptionRetryCount: attemptRetryCount,
        transcriptionLastCheckedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function classroomInterpretationAvailability() {
  return {
    shengwang: isAgoraTranscriptionConfigured(),
    wordly: isWordlyConfigured() ? await isWordlyHealthy() : false,
  };
}

export async function reconcileClassroomTranscription(sessionId: string) {
  const runtime = await prisma.classroomRuntime.findUnique({
    where: { sessionId },
  });
  if (
    !runtime ||
    !runtime.interpretationEnabled ||
    runtime.status !== "live"
  ) {
    return runtime;
  }
  if (!runtime.transcriptionAgentId) {
    if (
      ["failed", "starting", "recovering"].includes(
        runtime.transcriptionStatus,
      ) &&
      runtime.transcriptionRetryCount < 3
    ) {
      const nextRetryCount = runtime.transcriptionRetryCount + 1;
      await prisma.classroomRuntime.update({
        where: { id: runtime.id },
        data: {
          transcriptionStatus: "recovering",
          transcriptionRetryCount: nextRetryCount,
          transcriptionLastCheckedAt: new Date(),
        },
      });
      return syncClassroomTranscription(runtime.courseId, {
        sessionId,
        restart: true,
        retryCount: nextRetryCount,
      });
    }
    return runtime;
  }
  try {
    const providerState = await queryAgoraTranscription(
      runtime.transcriptionAgentId,
    );
    const status = normalizeAgoraTranscriptionStatus(providerState);
    if (["starting", "running", "recovering", "stopping"].includes(status)) {
      return prisma.classroomRuntime.update({
        where: { id: runtime.id },
        data: {
          transcriptionStatus: status,
          transcriptionError: null,
          transcriptionLastCheckedAt: new Date(),
        },
      });
    }
    if (
      ["failed", "stopped", "unknown"].includes(status) &&
      runtime.transcriptionRetryCount < 3
    ) {
      const nextRetryCount = runtime.transcriptionRetryCount + 1;
      await prisma.classroomRuntime.update({
        where: { id: runtime.id },
        data: {
          transcriptionStatus: "recovering",
          transcriptionRetryCount: nextRetryCount,
          transcriptionLastCheckedAt: new Date(),
          transcriptionError: `Shengwang ASR agent is ${status}`,
        },
      });
      return syncClassroomTranscription(runtime.courseId, {
        sessionId,
        restart: true,
        retryCount: nextRetryCount,
      });
    }
    return prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: {
        transcriptionStatus: "failed",
        transcriptionLastCheckedAt: new Date(),
        transcriptionError: `Shengwang ASR agent is ${status}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to query Shengwang ASR";
    return prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: {
        transcriptionStatus: "failed",
        transcriptionLastCheckedAt: new Date(),
        transcriptionError: message.slice(0, 1000),
      },
    });
  }
}

export async function reconcileActiveClassroomTranscriptions() {
  const runtimes = await prisma.classroomRuntime.findMany({
    where: {
      status: "live",
      interpretationEnabled: true,
      OR: [
        { transcriptionAgentId: { not: null } },
        { transcriptionStatus: { in: ["failed", "starting", "recovering"] } },
      ],
    },
    select: { sessionId: true },
    take: 50,
  });
  let reconciled = 0;
  for (const runtime of runtimes) {
    await reconcileClassroomTranscription(runtime.sessionId);
    reconciled += 1;
  }
  return reconciled;
}
