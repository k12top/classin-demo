import "server-only";

import type {
  ClassroomCaptionInput,
  ClassroomCaptionSnapshot,
} from "@/lib/classroom/types";
import { prisma } from "@/lib/db";
import { ensureWordlyRoom, translateCaptionWithWordly } from "@/lib/classroom/translation/wordly";
import { courseIdToRoomUuid } from "@/lib/course-room";
import { normalizeTargetLanguages } from "@/lib/classroom/languages";
import { shouldReusePersistedCaption } from "@/lib/classroom/caption-idempotency";
import { ensureClassroomRuntime } from "@/lib/classroom/server/runtime";

function translationsRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([language, text]) => [language.slice(0, 32), text.trim().slice(0, 10_000)])
      .filter(([, text]) => Boolean(text)),
  );
}

function publicCaption(caption: {
  externalId: string;
  provider: string;
  speakerId: string;
  speakerName: string;
  sourceLanguage: string;
  detectedLanguage: string;
  text: string;
  translations: unknown;
  isFinal: boolean;
  occurredAt: Date;
  createdAt: Date;
}): ClassroomCaptionSnapshot {
  return {
    id: caption.externalId,
    provider: caption.provider === "wordly" ? "wordly" : "shengwang",
    speakerId: caption.speakerId,
    speakerName: caption.speakerName,
    sourceLanguage: caption.sourceLanguage,
    detectedLanguage: caption.detectedLanguage,
    text: caption.text,
    translations: translationsRecord(caption.translations),
    isFinal: caption.isFinal,
    occurredAt: caption.occurredAt.toISOString(),
    createdAt: caption.createdAt.toISOString(),
  };
}

export async function getClassroomCaptions(
  courseId: string,
  take = 100,
  sessionId = courseId,
) {
  const captions = await prisma.classroomCaption.findMany({
    where: { sessionId },
    orderBy: { occurredAt: "desc" },
    take: Math.min(300, Math.max(1, take)),
  });
  return captions.reverse().map(publicCaption);
}

export async function ingestClassroomCaption(
  courseId: string,
  input: ClassroomCaptionInput,
  sessionId = courseId,
) {
  const runtime = await ensureClassroomRuntime(courseId, sessionId);
  const lesson = await prisma.courseSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { id: true, title: true, roomUuid: true },
  });
  const externalId = input.id.trim().slice(0, 240);
  const text = input.text.trim().slice(0, 20_000);
  if (!externalId || !text) throw new Error("Caption id and text are required");

  return prisma.$transaction(
    async (transaction) => {
      // Serialize every update for this logical caption across server instances.
      // This prevents duplicate Wordly billing and prevents a late partial from
      // overwriting an already persisted final sentence.
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${sessionId}),
          hashtext(${externalId})
        )
      `;

      const existingCaption = await transaction.classroomCaption.findUnique({
        where: { sessionId_externalId: { sessionId, externalId } },
      });
      const existingTranslations = translationsRecord(
        existingCaption?.translations,
      );
      const incomingTranslations = translationsRecord(input.translations);
      const wordlyTargets = normalizeTargetLanguages(
        runtime.targetLanguages,
        runtime.sourceLanguage,
        20,
      );
      const wordlyFinal =
        runtime.interpretationEnabled &&
        runtime.interpretationProvider === "wordly" &&
        input.isFinal;
      if (
        existingCaption &&
        shouldReusePersistedCaption({
          existingIsFinal: existingCaption.isFinal,
          existingText: existingCaption.text,
          existingTranslations,
          incomingIsFinal: input.isFinal,
          incomingText: text,
          incomingTranslations,
          provider: wordlyFinal ? "wordly" : "shengwang",
          targetLanguages: wordlyTargets,
        })
      ) {
        const currentRuntime = await transaction.classroomRuntime.findUnique({
          where: { id: runtime.id },
          select: { revision: true },
        });
        return {
          caption: publicCaption(existingCaption),
          revision: currentRuntime?.revision ?? runtime.revision,
        };
      }

      const member = input.speakerId
        ? await transaction.classroomMemberState.findUnique({
            where: { sessionId_userId: { sessionId, userId: input.speakerId } },
            select: { displayName: true },
          })
        : null;
      let normalized: ClassroomCaptionInput = {
        ...input,
        id: externalId,
        text,
        speakerId: input.speakerId.slice(0, 240),
        speakerName: (
          input.speakerName ||
          member?.displayName ||
          "Speaker"
        ).slice(0, 240),
        sourceLanguage: input.sourceLanguage.slice(0, 32),
        detectedLanguage: input.detectedLanguage.slice(0, 32),
        translations: {
          ...existingTranslations,
          ...incomingTranslations,
        },
      };
      let translationError: string | null = null;
      if (wordlyFinal) {
        try {
          await ensureWordlyRoom({
            courseId: sessionId,
            title: lesson.title,
            channelName: courseIdToRoomUuid(lesson.id, lesson.roomUuid),
            sourceLanguage: runtime.sourceLanguage,
            targetLanguages: wordlyTargets,
          });
          const translated = await translateCaptionWithWordly(
            sessionId,
            normalized,
          );
          normalized = {
            ...normalized,
            translations: {
              ...normalized.translations,
              ...translationsRecord(translated.translations),
            },
          };
        } catch (error) {
          translationError =
            error instanceof Error
              ? error.message
              : "Wordly translation failed";
        }
      }

      const occurredAt = new Date(input.occurredAt);
      const safeOccurredAt = Number.isNaN(occurredAt.getTime())
        ? new Date()
        : occurredAt;
      const provider =
        runtime.interpretationProvider === "wordly"
          ? "wordly"
          : "shengwang";
      const caption = await transaction.classroomCaption.upsert({
        where: { sessionId_externalId: { sessionId, externalId } },
        create: {
          runtimeId: runtime.id,
          courseId,
          sessionId,
          externalId,
          provider,
          speakerId: normalized.speakerId,
          speakerName: normalized.speakerName || "Speaker",
          sourceLanguage: normalized.sourceLanguage,
          detectedLanguage: normalized.detectedLanguage,
          text: normalized.text,
          translations: normalized.translations,
          isFinal: normalized.isFinal,
          occurredAt: safeOccurredAt,
        },
        update: {
          provider,
          speakerId: normalized.speakerId,
          speakerName: normalized.speakerName || "Speaker",
          sourceLanguage: normalized.sourceLanguage,
          detectedLanguage: normalized.detectedLanguage,
          text: normalized.text,
          translations: normalized.translations,
          isFinal: normalized.isFinal,
          occurredAt: safeOccurredAt,
        },
      });
      const updatedRuntime =
        input.isFinal || translationError
          ? await transaction.classroomRuntime.update({
              where: { id: runtime.id },
              data: {
                revision: { increment: 1 },
                transcriptionError: translationError
                  ? translationError.slice(0, 1000)
                  : null,
              },
            })
          : runtime;
      return {
        caption: publicCaption(caption),
        revision: updatedRuntime.revision,
      };
    },
    { maxWait: 5_000, timeout: 25_000 },
  );
}
