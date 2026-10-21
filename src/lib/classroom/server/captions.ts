import { createHash, randomUUID } from "node:crypto";
import { runClaimedCaptionTranslation, captionTranslationState } from "../caption-translation";
import type { Prisma } from "@prisma/client";
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
  updatedAt: Date;
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
    updatedAt: caption.updatedAt.toISOString(),
  };
}

function translationNoticeId(sessionId: string, caption: Pick<ClassroomCaptionSnapshot, "id" | "text" | "sourceLanguage">, targets: string[]) {
  return `caption-translation:${createHash("sha256").update(JSON.stringify([sessionId, caption.id, caption.text, caption.sourceLanguage, targets])).digest("hex")}`;
}
function jobPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function getClassroomCaptions(courseId: string, take = 100, sessionId = courseId) {
  const [captions, runtime] = await Promise.all([
    prisma.classroomCaption.findMany({ where: { sessionId }, orderBy: { occurredAt: "desc" }, take: Math.min(300, Math.max(1, take)) }),
    prisma.classroomRuntime.findUnique({ where: { sessionId }, select: { interpretationEnabled: true, interpretationProvider: true, targetLanguages: true, sourceLanguage: true } }),
  ]);
  const publicItems = captions.reverse().map(publicCaption);
  if (!runtime?.interpretationEnabled || runtime.interpretationProvider !== "wordly") return publicItems;
  const targets = normalizeTargetLanguages(runtime.targetLanguages, runtime.sourceLanguage, 20);
  const pending = publicItems.filter(item => item.isFinal && targets.some(language => !item.translations[language]));
  if (!pending.length) return publicItems;
  const jobs = await prisma.classroomProviderEvent.findMany({ where: { provider: "classroom-translation", noticeId: { in: pending.map(item => translationNoticeId(sessionId, item, targets)) } }, select: { noticeId: true, payload: true } });
  const states = new Map(jobs.map(job => [job.noticeId, captionTranslationState(job.payload)]));
  return publicItems.map(item => {
    const translationStatus = states.get(translationNoticeId(sessionId, item, targets));
    return { ...item, ...(translationStatus && { translationStatus }) };
  });
}

/** Recommit cached output or retry a proven pre-dispatch failure; never replay
 * a transcript request whose paid outcome is unknown. Called after teacher ACL. */
export async function recoverClassroomCaptionTranslation(courseId: string, sessionId: string, captionId: string) {
  const row = await prisma.classroomCaption.findUnique({ where: { sessionId_externalId: { sessionId, externalId: captionId } } });
  if (!row || row.courseId !== courseId || !row.isFinal) throw new Error("Final caption not found");
  return ingestClassroomCaption(courseId, publicCaption(row), sessionId, { recoverOnly: true });
}

export async function ingestClassroomCaption(
  courseId: string,
  input: ClassroomCaptionInput,
  sessionId = courseId,
  options: { recoverOnly?: boolean } = {},
) {
  const runtime = await ensureClassroomRuntime(courseId, sessionId);
  const lesson = await prisma.courseSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { id: true, title: true, roomUuid: true, endedAt: true },
  });
  // A transcription provider can finish its last sentence just after the
  // teacher ends class. Keep that final sentence, but quietly discard delayed
  // partials and any later callbacks from an already stopped agent.
  if (
    runtime.status === "ended" &&
    (!input.isFinal ||
      !lesson.endedAt ||
      Date.now() - lesson.endedAt.getTime() > 30_000)
  ) {
    return { ignored: true };
  }
  const externalId = input.id.trim().slice(0, 240);
  const text = input.text.trim().slice(0, 20_000);
  const suppliedTranslations = translationsRecord(input.translations);
  if (!externalId || (!text && !Object.keys(suppliedTranslations).length)) {
    throw new Error("Caption id and content are required");
  }

  const claim = randomUUID();
  let initialReservation: Prisma.InputJsonObject | null = null;
  const result = await prisma.$transaction(
    async (transaction) => {
      // Serialize every update for this logical caption across server instances.
      // This prevents duplicate Wordly billing and prevents a late partial from
      // overwriting an already persisted final sentence.
      await transaction.$queryRaw`
        SELECT 1 AS locked FROM pg_advisory_xact_lock(
          hashtext(${sessionId}),
          hashtext(${externalId})
        )
      `;

      const existingCaption = await transaction.classroomCaption.findUnique({
        where: { sessionId_externalId: { sessionId, externalId } },
      });
      const existingTranslations = translationsRecord(
        !text || existingCaption?.text === text ? existingCaption?.translations : {},
      );
      const incomingTranslations = suppliedTranslations;
      const effectiveText = text || existingCaption?.text || "";
      const wordlyTargets = normalizeTargetLanguages(
        runtime.targetLanguages,
        runtime.sourceLanguage,
        20,
      );
      const wordlyFinal =
        runtime.interpretationEnabled &&
        runtime.interpretationProvider === "wordly" &&
        input.isFinal && wordlyTargets.length > 0;
      if (
        existingCaption &&
        shouldReusePersistedCaption({
          existingIsFinal: existingCaption.isFinal,
          existingText: existingCaption.text,
          existingTranslations,
          incomingIsFinal: input.isFinal,
          incomingText: effectiveText,
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
      const normalized: ClassroomCaptionInput = {
        ...input,
        id: externalId,
        text: effectiveText,
        speakerId:
          input.speakerId.slice(0, 240) || existingCaption?.speakerId || "",
        speakerName: (
          input.speakerName ||
          member?.displayName ||
          existingCaption?.speakerName ||
          "Speaker"
        ).slice(0, 240),
        sourceLanguage:
          input.sourceLanguage.slice(0, 32) ||
          existingCaption?.sourceLanguage ||
          "",
        detectedLanguage:
          input.detectedLanguage.slice(0, 32) ||
          existingCaption?.detectedLanguage ||
          "",
        translations: {
          ...existingTranslations,
          ...incomingTranslations,
        },
      };
      const occurredAt = new Date(input.occurredAt);
      const safeOccurredAt = Number.isNaN(occurredAt.getTime())
        ? new Date()
        : occurredAt;
      const provider =
        runtime.interpretationProvider === "wordly"
          ? "wordly"
          : "shengwang";
      const updatedAt = new Date(Math.max(Date.now(), (existingCaption?.updatedAt.getTime() ?? 0) + 1));
      const caption = await transaction.classroomCaption.upsert({
        where: { sessionId_externalId: { sessionId, externalId } },
        create: {
          updatedAt,
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
          isFinal: normalized.isFinal || existingCaption?.isFinal || false,
          occurredAt: safeOccurredAt,
        },
        update: {
          updatedAt,
          provider,
          speakerId: normalized.speakerId,
          speakerName: normalized.speakerName || "Speaker",
          sourceLanguage: normalized.sourceLanguage,
          detectedLanguage: normalized.detectedLanguage,
          text: normalized.text,
          translations: normalized.translations,
          isFinal: normalized.isFinal || existingCaption?.isFinal || false,
          occurredAt: safeOccurredAt,
        },
      });
      const updatedRuntime =
        input.isFinal
          ? await transaction.classroomRuntime.update({
              where: { id: runtime.id },
              data: {
                revision: { increment: 1 },
              },
            })
          : runtime;
      if (!options.recoverOnly && wordlyFinal && wordlyTargets.some(language => !translationsRecord(caption.translations)[language])) {
        const payload = { claim, state: "preparing", sessionId, captionId: externalId, at: new Date().toISOString() };
        const reservation = await transaction.classroomProviderEvent.createMany({ data: [{
          noticeId: translationNoticeId(sessionId, publicCaption(caption), wordlyTargets), provider: "classroom-translation", category: "caption", payload,
        }], skipDuplicates: true });
        if (reservation.count === 1) initialReservation = payload;
      }
      return {
        caption: publicCaption(caption),
        revision: updatedRuntime.revision,
      };
    },
    { maxWait: 5_000, timeout: 5_000 },
  );
  const targets = normalizeTargetLanguages(runtime.targetLanguages, runtime.sourceLanguage, 20);
  if (!input.isFinal || !result.caption?.isFinal || runtime.interpretationProvider !== "wordly" || !runtime.interpretationEnabled ||
      !targets.some(language => !result.caption.translations[language]) || result.caption.text !== text) {
    if (targets.length && targets.every(language => result.caption.translations[language])) result.caption.translationStatus = "completed";
    return result;
  }
  // Reuse the existing durable provider-event ledger; a new provider/category
  // isolates these reservations from recording/webhook consumers.
  const noticeId = translationNoticeId(sessionId, result.caption, targets);
  let ownedPayload: Prisma.InputJsonObject = {};
  const payloadFor = (state: string, extra: Prisma.InputJsonObject = {}): Prisma.InputJsonObject => ({ claim, state, sessionId, captionId: externalId, at: new Date().toISOString(), ...extra });
  await runClaimedCaptionTranslation({
    readSaved: async () => {
      const existing = await prisma.classroomProviderEvent.findUnique({ where: { noticeId } });
      const saved = jobPayload(existing?.payload);
      const translations = translationsRecord(saved.translations);
      return ["translated", "completed"].includes(String(saved.state)) && targets.every(language => translations[language])
        ? { ...input, ...result.caption, translations } : null;
    },
    reserve: async () => {
      if (initialReservation) { ownedPayload = initialReservation; return true; }
      ownedPayload = payloadFor("preparing");
      if (!options.recoverOnly) {
        const reservation = await prisma.classroomProviderEvent.createMany({ data: [{ noticeId, provider: "classroom-translation", category: "caption", payload: ownedPayload }], skipDuplicates: true });
        if (reservation.count === 1) return true;
      }
      const existing = await prisma.classroomProviderEvent.findUnique({ where: { noticeId } });
      const previous = jobPayload(existing?.payload);
      // Only explicit recovery may reclaim a known pre-dispatch failure. A
      // legacy "running" or a "requesting" record is never safe to replay.
      const stalePreparing = previous.state === "preparing" && captionTranslationState(previous) !== "pending";
      if (!options.recoverOnly || !existing || !(previous.state === "failed" || stalePreparing)) return false;
      return (await prisma.classroomProviderEvent.updateMany({ where: { noticeId, payload: { equals: existing.payload as Prisma.InputJsonValue } }, data: { payload: ownedPayload, processedAt: null } })).count === 1;
    },
    prepare: async () => { await ensureWordlyRoom({ courseId: sessionId, title: lesson.title, channelName: courseIdToRoomUuid(lesson.id, lesson.roomUuid), sourceLanguage: runtime.sourceLanguage, targetLanguages: targets }); },
    beforeTranslate: async () => {
      const next = payloadFor("requesting");
      const changed = await prisma.classroomProviderEvent.updateMany({ where: { noticeId, payload: { equals: ownedPayload } }, data: { payload: next } });
      if (changed.count !== 1) throw new Error("Translation reservation changed before dispatch");
      ownedPayload = next;
    },
    translate: async () => {
      const translated = await translateCaptionWithWordly(sessionId, { ...input, ...result.caption });
      const available = { ...result.caption.translations, ...translationsRecord(translated.translations) };
      if (targets.some(language => !available[language])) throw new Error("Translation response is incomplete");
      return { ...translated, translations: available };
    },
    saveResult: async translated => {
      const saved = payloadFor("translated", { translations: translationsRecord(translated.translations) });
      const changed = await prisma.classroomProviderEvent.updateMany({ where: { noticeId, payload: { equals: ownedPayload } }, data: { payload: saved } });
      if (changed.count !== 1) throw new Error("Translation reservation changed before result persistence");
      ownedPayload = saved;
    },
    commit: async translated => {
      await prisma.$transaction(async transaction => {
        await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${sessionId}), hashtext(${externalId}))`;
        const current = await transaction.classroomCaption.findUnique({ where: { sessionId_externalId: { sessionId, externalId } } });
        // A correction received during translation owns the current text. Never
        // attach a stale translation to it or resurrect a removed caption.
        if (current?.text === result.caption.text && current.sourceLanguage === result.caption.sourceLanguage &&
            Object.entries(translationsRecord(translated.translations)).some(([language, value]) => translationsRecord(current.translations)[language] !== value)) {
          const updated = await transaction.classroomCaption.update({ where: { id: current.id }, data: { updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)), translations: { ...translationsRecord(current.translations), ...translationsRecord(translated.translations) } } });
          const state = await transaction.classroomRuntime.update({ where: { id: runtime.id }, data: { revision: { increment: 1 }, transcriptionError: null } });
          result.caption = publicCaption(updated);
          result.revision = state.revision;
        } else if (current) {
          result.caption = publicCaption(current);
          const state = await transaction.classroomRuntime.findUnique({ where: { id: runtime.id }, select: { revision: true } });
          result.revision = state?.revision ?? result.revision;
        }
        await transaction.classroomProviderEvent.update({ where: { noticeId }, data: { processedAt: new Date(), payload: payloadFor("completed", { translations: translationsRecord(translated.translations) }) } });
      }, { maxWait: 5_000, timeout: 5_000 });
    },
    fail: async stage => {
      await prisma.$transaction(async transaction => {
        const changed = await transaction.classroomProviderEvent.updateMany({ where: { noticeId, payload: { equals: ownedPayload } }, data: { processedAt: new Date(), payload: payloadFor(stage === "prepare" ? "failed" : "unknown") } });
        if (changed.count !== 1) return;
        const state = await transaction.classroomRuntime.update({ where: { id: runtime.id }, data: { revision: { increment: 1 }, transcriptionError: stage === "prepare" ? "Translation could not start; original captions are available." : "Translation outcome is unknown; original captions are available." } });
        result.revision = state.revision;
      }, { maxWait: 5_000, timeout: 5_000 });
    },
  });
  const finalJob = await prisma.classroomProviderEvent.findUnique({ where: { noticeId } });
  result.caption.translationStatus = captionTranslationState(finalJob?.payload);
  return result;
}
