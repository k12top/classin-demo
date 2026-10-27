import { captionStartPreferences } from "../caption-start-preferences";
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CLASSROOM_RECONNECT_WINDOW_MS } from "@/lib/classroom/presence";
import { captionTranslationLimit, supportsCaptionTranslation, type CaptionTranslationProvider } from "@/lib/classroom/translation-capabilities";
import { planCaptionTranslations } from "../caption-routing";
import { wordlyTranslationCapabilities } from "@/lib/classroom/translation/wordly";

export class CaptionPreferenceError extends Error {
  constructor(message: string, public code: string, public status = 400) { super(message); }
}

export async function captionDemandTargets(tx: Prisma.TransactionClient, sessionId: string, sourceLanguage: string, _provider: CaptionTranslationProvider) {
  void _provider;
  const connections = await tx.classroomConnection.findMany({
    where: { sessionId, leftAt: null, lastSeenAt: { gte: new Date(Date.now() - CLASSROOM_RECONNECT_WINDOW_MS) }, captionLanguage: { not: null } },
    select: { captionLanguage: true },
  });
  if (!supportsCaptionTranslation("shengwang", sourceLanguage)) return [];
  const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId }, select: { captionStartPreferences: true } });
  const start = captionStartPreferences(runtime?.captionStartPreferences);
  const defaults = start.autoInterpretation ? start.targetLanguages : [];
  // Preserve accepted demand during a temporary bridge outage. Synchronization
  // reports the unavailable tracks instead of silently discarding preferences.
  return [...new Set([...defaults, ...connections.map(connection => connection.captionLanguage!)].filter(language => language !== sourceLanguage))].sort();
}

/** Caller holds the runtime row lock, so simultaneous choices cannot lose demand. */
export async function refreshCaptionDemand(tx: Prisma.TransactionClient, sessionId: string) {
  const runtime = await tx.classroomRuntime.findUniqueOrThrow({ where: { sessionId } });
  const provider = runtime.interpretationProvider === "wordly" ? "wordly" : "shengwang";
  const targets = await captionDemandTargets(tx, sessionId, runtime.sourceLanguage, provider);
  if (targets.length > captionTranslationLimit(provider)) {
    throw new CaptionPreferenceError("当前课堂使用的翻译语言已达上限，请选择已开启的语言或稍后重试", "caption_language_limit", 409);
  }
  const changed = JSON.stringify(runtime.targetLanguages) !== JSON.stringify(targets);
  const current = changed ? await tx.classroomRuntime.update({ where: { sessionId }, data: { targetLanguages: targets, revision: { increment: 1 } } }) : runtime;
  return { runtime: current, changed, targetLanguages: targets };
}

export async function reconcileCaptionDemand(sessionId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    return refreshCaptionDemand(tx, sessionId);
  });
}

export async function saveCaptionPreference(sessionId: string, userId: string, clientId: string, language: string | null) {
  // Capability discovery can take seconds; never hold the classroom row lock
  // across a network request. The same snapshot validates combined demand.
  const bridge = await wordlyTranslationCapabilities();
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUniqueOrThrow({ where: { sessionId } });
    if (runtime.status === "ended") throw new CaptionPreferenceError("课堂已结束", "classroom_ended", 409);
    const provider = runtime.interpretationProvider === "wordly" ? "wordly" : "shengwang";
    const plan = planCaptionTranslations(provider, runtime.sourceLanguage, language === null ? [] : [language], bridge);
    if (language !== null && (plan.unsupportedTargets.length > 0 || !supportsCaptionTranslation("shengwang", runtime.sourceLanguage))) {
      throw new CaptionPreferenceError("当前翻译服务不支持此语言", "caption_language_unsupported");
    }
    const id = `${sessionId}:${userId}:${clientId}`;
    const connection = await tx.classroomConnection.findUnique({ where: { id } });
    if (!connection || connection.sessionId !== sessionId || connection.userId !== userId || connection.leftAt || connection.lastSeenAt.getTime() < Date.now() - CLASSROOM_RECONNECT_WINDOW_MS) {
      throw new CaptionPreferenceError("请重新进入课堂后选择字幕语言", "classroom_connection_closed", 409);
    }
    // A periodic retry must not create a connection write and Redis invalidation
    // when the subscription hasn't changed. Leave uses this same runtime lock.
    if (connection.captionLanguage !== language) await tx.classroomConnection.update({ where: { id }, data: { captionLanguage: language } });
    const result = await refreshCaptionDemand(tx, sessionId);
    if (planCaptionTranslations(provider, runtime.sourceLanguage, result.targetLanguages, bridge).exceedsLimit) {
      throw new CaptionPreferenceError("当前课堂使用的翻译语言已达上限，请选择已开启的语言或稍后重试", "caption_language_limit", 409);
    }
    return result;
  });
}
