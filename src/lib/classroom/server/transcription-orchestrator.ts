import "server-only";

import { prisma } from "@/lib/db";
import { courseIdToRoomUuid } from "@/lib/course-room";
import {
  normalizeClassroomLanguage,
  normalizeTargetLanguages,
} from "@/lib/classroom/languages";
import {
  isAgoraTranscriptionConfigured,
  queryAgoraTranscription,
  startAgoraTranscription,
  stopAgoraTranscription,
  updateAgoraTranscription,
} from "@/lib/classroom/transcription/agora-stt";
import {
  ensureWordlyRoom,
  isWordlyConfigured,
  stopWordlyRoom,
} from "@/lib/classroom/translation/wordly";
import { ensureClassroomRuntime } from "@/lib/classroom/server/runtime";

export async function stopClassroomTranscription(courseId: string) {
  const runtime = await prisma.classroomRuntime.findUnique({ where: { courseId } });
  if (!runtime) return;
  const agentId = runtime.transcriptionAgentId;
  await Promise.allSettled([
    agentId ? stopAgoraTranscription(agentId) : Promise.resolve(),
    runtime.interpretationProvider === "wordly"
      ? stopWordlyRoom(courseId)
      : Promise.resolve(),
  ]);
  await prisma.classroomRuntime.update({
    where: { id: runtime.id },
    data: {
      transcriptionAgentId: null,
      transcriptionStatus: "stopped",
      transcriptionError: null,
    },
  });
}

export async function syncClassroomTranscription(
  courseId: string,
  options: { restart?: boolean } = {},
) {
  await ensureClassroomRuntime(courseId);
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
    include: { classroomRuntime: true },
  });
  const runtime = course.classroomRuntime!;

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
    await stopClassroomTranscription(courseId);
    return prisma.classroomRuntime.findUniqueOrThrow({ where: { courseId } });
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
    const channelName = courseIdToRoomUuid(course.id, course.roomUuid);
    if (provider === "wordly") {
      if (!isWordlyConfigured()) {
        throw new Error("Wordly is not configured. Set WORDLY_API_URL and WORDLY_INTERNAL_TOKEN.");
      }
      await ensureWordlyRoom({
        courseId,
        title: course.name,
        channelName,
        sourceLanguage,
        targetLanguages,
      });
    } else {
      await stopWordlyRoom(courseId).catch(() => undefined);
    }

    if (options.restart && runtime.transcriptionAgentId) {
      try {
        const current = await queryAgoraTranscription(
          runtime.transcriptionAgentId,
        );
        const status =
          typeof current.status === "string"
            ? current.status.toUpperCase()
            : "";
        if (["RUNNING", "STARTING", "RECOVERING"].includes(status)) {
          await updateAgoraTranscription(runtime.transcriptionAgentId, {
            sourceLanguage,
            targetLanguages,
            translationProvider: provider,
          });
          return prisma.classroomRuntime.update({
            where: { id: runtime.id },
            data: {
              transcriptionStatus: "running",
              transcriptionError: null,
            },
          });
        }
      } catch (error) {
        console.warn("[classroom:captions] live update failed; restarting", {
          courseId,
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
      },
    });
    const started = await startAgoraTranscription({
      courseId,
      channelName,
      sourceLanguage,
      targetLanguages,
      translationProvider: provider,
    });
    return prisma.classroomRuntime.update({
      where: { id: runtime.id },
      data: {
        transcriptionStatus: "running",
        transcriptionAgentId: started.agentId,
        transcriptionError: null,
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
      },
    });
    throw error;
  }
}
