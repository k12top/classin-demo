import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ClassroomIntegrationEvent, ClassroomIntegrationEventType } from "../integration-events";
import { classroomWebhookConfig, sendClassroomWebhook, webhookRetryAt } from "../webhook-delivery";

/** Call inside the same transaction as the authoritative state change. */
export async function enqueueClassroomEvent(tx: Prisma.TransactionClient, sessionId: string, type: ClassroomIntegrationEventType, reason: string, actor?: ClassroomIntegrationEvent["actor"], departureKey?: string) {
  if (!process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL?.trim() || !process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET?.trim()) return;
  const lesson = await tx.courseSession.findUniqueOrThrow({ where: { id: sessionId }, include: { classroomRuntime: true } });
  const runtime = lesson.classroomRuntime;
  const startedAt = runtime?.startedAt?.toISOString() ?? null;
  const cycle = reason === "cancelled" ? lesson.endedAt?.toISOString() ?? "cancelled" : startedAt ?? "unstarted";
  const dedupeKey = `${sessionId}:${cycle}:${type}${departureKey ? `:${departureKey}` : ""}`;
  const id = randomUUID();
  const payload: ClassroomIntegrationEvent = {
    source: "classroom", version: 1, eventId: id, type,
    occurredAt: new Date().toISOString(), courseId: lesson.courseId, sessionId,
    courseStatus: lesson.status, classroomStatus: runtime?.status ?? (type === "classroom.ended" ? "ended" : "waiting"),
    ended: type === "classroom.ended" || runtime?.status === "ended",
    reason, startedAt, ...(actor && { actor }),
  };
  await tx.classroomIntegrationEvent.createMany({ data: [{ id, dedupeKey, sessionId, payload: payload as unknown as Prisma.InputJsonValue }], skipDuplicates: true });
}

/** A lease prevents concurrent cron/after workers from sending the same row. */
export async function deliverClassroomEvents(limit = 10) {
  const config = classroomWebhookConfig();
  if (!config) return { delivered: 0, failed: 0 };
  let delivered = 0, failed = 0;
  for (let i = 0; i < limit; i++) {
    const now = new Date();
    const claim = randomUUID();
    const row = await prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<{ id: string }[]>`SELECT e."id" FROM "ClassroomIntegrationEvent" e WHERE e."deliveredAt" IS NULL AND e."nextAttemptAt" <= ${now} AND (e."lockedUntil" IS NULL OR e."lockedUntil" <= ${now}) AND NOT EXISTS (SELECT 1 FROM "ClassroomIntegrationEvent" older WHERE older."sessionId" = e."sessionId" AND older."deliveredAt" IS NULL AND (older."createdAt", older."id") < (e."createdAt", e."id")) ORDER BY e."createdAt", e."id" LIMIT 1 FOR UPDATE OF e SKIP LOCKED`;
      if (!candidates[0]) return null;
      return tx.classroomIntegrationEvent.update({ where: { id: candidates[0].id }, data: { claim, lockedUntil: new Date(now.getTime() + 30_000), attempts: { increment: 1 } } });
    });
    if (!row) break;
    try {
      await sendClassroomWebhook(row.payload as unknown as ClassroomIntegrationEvent, config);
      await prisma.classroomIntegrationEvent.updateMany({ where: { id: row.id, claim }, data: { deliveredAt: new Date(), lockedUntil: null, claim: null, lastError: null } });
      delivered++;
    } catch (error) {
      await prisma.classroomIntegrationEvent.updateMany({ where: { id: row.id, claim }, data: { nextAttemptAt: webhookRetryAt(row.attempts), lockedUntil: null, claim: null, lastError: error instanceof Error ? error.message.slice(0, 500) : "Webhook delivery failed" } });
      failed++;
    }
  }
  return { delivered, failed };
}
