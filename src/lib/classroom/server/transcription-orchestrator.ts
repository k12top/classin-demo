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

const TRANSCRIPTION_TRANSITION_LEASE_MS = 30_000;
const TRANSCRIPTION_HEALTH_CHECK_INTERVAL_MS = 30_000;

function defaultTargetLanguage(sourceLanguage: string) {
  return sourceLanguage === "zh-CN" || sourceLanguage === "zh-TW"
    ? "en-US"
    : "zh-CN";
}

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
  options: {
    restart?: boolean;
    sessionId?: string;
    retryCount?: number;
    claimed?: boolean;
    knownInactiveAgentId?: string;
  } = {},
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

  if (!options.claimed) {
    const claimAt = new Date();
    const claimed = await prisma.classroomRuntime.updateMany({
      where: {
        id: runtime.id,
        interpretationEnabled: true,
        status: "live",
        OR: [
          { transcriptionLastCheckedAt: null },
          {
            transcriptionLastCheckedAt: {
              lt: new Date(
                claimAt.getTime() - TRANSCRIPTION_TRANSITION_LEASE_MS,
              ),
            },
          },
        ],
      },
      data: {
        transcriptionStatus: "starting",
        transcriptionLastCheckedAt: claimAt,
      },
    });
    if (!claimed.count) {
      return prisma.classroomRuntime.findUniqueOrThrow({
        where: { sessionId },
      });
    }
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
        if (options.knownInactiveAgentId !== runtime.transcriptionAgentId) {
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
    console.info("[classroom:captions] ASR agent started", {
      sessionId,
      provider,
      status: started.status,
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
    console.error("[classroom:captions] ASR agent start failed", {
      sessionId,
      provider,
      message,
    });
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
      ["failed", "starting", "recovering", "stopped"].includes(
        runtime.transcriptionStatus,
      ) &&
      runtime.transcriptionRetryCount < 3
    ) {
      const initialAttempt =
        runtime.transcriptionStatus === "starting" &&
        runtime.transcriptionRetryCount === 0 &&
        runtime.transcriptionLastCheckedAt === null;
      const nextRetryCount = initialAttempt
        ? 0
        : runtime.transcriptionRetryCount + 1;
      const claimAt = new Date();
      const claimed = await prisma.classroomRuntime.updateMany({
        where: {
          id: runtime.id,
          transcriptionAgentId: null,
          transcriptionRetryCount: runtime.transcriptionRetryCount,
          OR: [
            { transcriptionLastCheckedAt: null },
            {
              transcriptionLastCheckedAt: {
                lt: new Date(
                  claimAt.getTime() - TRANSCRIPTION_TRANSITION_LEASE_MS,
                ),
              },
            },
          ],
        },
        data: {
          transcriptionStatus: initialAttempt ? "starting" : "recovering",
          transcriptionRetryCount: nextRetryCount,
          transcriptionLastCheckedAt: claimAt,
        },
      });
      if (!claimed.count) {
        return prisma.classroomRuntime.findUnique({ where: { sessionId } });
      }
      return syncClassroomTranscription(runtime.courseId, {
        sessionId,
        restart: true,
        retryCount: nextRetryCount,
        claimed: true,
      });
    }
    return runtime;
  }
  // Teacher re-entry and the production cron can both check this agent.
  // Claim the provider query so they cannot each start a replacement.
  const checkAt = new Date();
  const claimed = await prisma.classroomRuntime.updateMany({
    where: {
      id: runtime.id,
      interpretationEnabled: true,
      status: "live",
      transcriptionAgentId: runtime.transcriptionAgentId,
      OR: [
        { transcriptionLastCheckedAt: null },
        {
          transcriptionLastCheckedAt: {
            lt: new Date(
              checkAt.getTime() - TRANSCRIPTION_HEALTH_CHECK_INTERVAL_MS,
            ),
          },
        },
      ],
    },
    data: { transcriptionLastCheckedAt: checkAt },
  });
  if (!claimed.count) {
    return prisma.classroomRuntime.findUnique({ where: { sessionId } });
  }

  let status: ReturnType<typeof normalizeAgoraTranscriptionStatus>;
  try {
    const providerState = await queryAgoraTranscription(runtime.transcriptionAgentId);
    status = normalizeAgoraTranscriptionStatus(providerState);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to query Shengwang ASR";
    await prisma.classroomRuntime.updateMany({
      where: {
        id: runtime.id,
        interpretationEnabled: true,
        status: "live",
        transcriptionAgentId: runtime.transcriptionAgentId,
      },
      data: {
        transcriptionStatus: "failed",
        transcriptionLastCheckedAt: new Date(),
        transcriptionError: message.slice(0, 1000),
      },
    });
    return prisma.classroomRuntime.findUnique({ where: { sessionId } });
  }
  if (["starting", "running", "recovering", "stopping"].includes(status)) {
    await prisma.classroomRuntime.updateMany({
      where: {
        id: runtime.id,
        interpretationEnabled: true,
        status: "live",
        transcriptionAgentId: runtime.transcriptionAgentId,
      },
      data: {
        transcriptionStatus: status,
        transcriptionError: null,
        ...(status === "running" ? { transcriptionRetryCount: 0 } : {}),
        transcriptionLastCheckedAt: new Date(),
      },
    });
    return prisma.classroomRuntime.findUnique({ where: { sessionId } });
  }
  if (runtime.transcriptionRetryCount < 3) {
    const nextRetryCount = runtime.transcriptionRetryCount + 1;
    const recovering = await prisma.classroomRuntime.updateMany({
      where: {
        id: runtime.id,
        interpretationEnabled: true,
        status: "live",
        transcriptionAgentId: runtime.transcriptionAgentId,
        transcriptionRetryCount: runtime.transcriptionRetryCount,
      },
      data: {
        transcriptionStatus: "recovering",
        transcriptionRetryCount: nextRetryCount,
        transcriptionLastCheckedAt: new Date(),
        transcriptionError: `Shengwang ASR agent is ${status}`,
      },
    });
    if (!recovering.count) {
      return prisma.classroomRuntime.findUnique({ where: { sessionId } });
    }
    console.warn("[classroom:captions] restarting inactive ASR agent", {
      sessionId,
      status,
      retryCount: nextRetryCount,
    });
    // The recovery claim above owns this transition. A second lease check
    // here would reject the restart using the timestamp we just wrote.
    return syncClassroomTranscription(runtime.courseId, {
      sessionId,
      restart: true,
      retryCount: nextRetryCount,
      claimed: true,
      knownInactiveAgentId: runtime.transcriptionAgentId,
    });
  }
  await prisma.classroomRuntime.updateMany({
    where: {
      id: runtime.id,
      interpretationEnabled: true,
      status: "live",
      transcriptionAgentId: runtime.transcriptionAgentId,
    },
    data: {
      transcriptionStatus: "failed",
      transcriptionLastCheckedAt: new Date(),
      transcriptionError: `Shengwang ASR agent is ${status}`,
    },
  });
  return prisma.classroomRuntime.findUnique({ where: { sessionId } });
}

/**
 * A live classroom should start captions when the lead teacher enters even if
 * the original `startClass` background callback was interrupted. Preserve an
 * explicit in-class disable (it has a last-checked timestamp), while upgrading
 * untouched legacy runtimes to the default Shengwang bilingual setup.
 */
export async function ensureClassroomTranscriptionForLiveSession(
  courseId: string,
  sessionId = courseId,
) {
  await ensureClassroomRuntime(courseId, sessionId);
  let runtime = await prisma.classroomRuntime.findUniqueOrThrow({
    where: { sessionId },
  });
  if (runtime.status !== "live") return runtime;

  const sourceLanguage = normalizeClassroomLanguage(runtime.sourceLanguage);
  const targets = normalizeTargetLanguages(
    runtime.targetLanguages,
    sourceLanguage,
    runtime.interpretationProvider === "wordly" ? 20 : 10,
  );
  const untouchedDisabledRuntime =
    !runtime.interpretationEnabled &&
    runtime.transcriptionAgentId === null &&
    runtime.transcriptionLastCheckedAt === null &&
    runtime.transcriptionRetryCount === 0;
  if (!runtime.interpretationEnabled && !untouchedDisabledRuntime) {
    return runtime;
  }

  const needsDefaultTarget = targets.length === 0;
  if (untouchedDisabledRuntime || needsDefaultTarget) {
    runtime = await prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: {
        interpretationEnabled: true,
        targetLanguages:
          targets.length > 0
            ? targets
            : [defaultTargetLanguage(sourceLanguage)],
        transcriptionStatus: needsDefaultTarget
          ? "starting"
          : runtime.transcriptionStatus,
        transcriptionError: null,
        transcriptionLastCheckedAt: null,
      },
    });
  }

  if (runtime.transcriptionAgentId && !needsDefaultTarget) {
    return (await reconcileClassroomTranscription(sessionId)) ?? runtime;
  }
  return syncClassroomTranscription(courseId, {
    sessionId,
    restart: needsDefaultTarget && Boolean(runtime.transcriptionAgentId),
  });
}

export async function reconcileActiveClassroomTranscriptions() {
  const runtimes = await prisma.classroomRuntime.findMany({
    where: {
      status: "live",
      interpretationEnabled: true,
      OR: [
        { transcriptionAgentId: { not: null } },
        {
          transcriptionStatus: {
            in: ["failed", "starting", "recovering", "stopped"],
          },
        },
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
