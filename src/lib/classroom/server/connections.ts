import "server-only";
import { prisma } from "@/lib/db";
import { enqueueClassroomEvent } from "./integration-events";
import { classroomRtcUid } from "@/lib/classroom/rtc-uid";
import { normalizeClassroomComposition } from "@/lib/classroom/composition";
import type { Prisma } from "@prisma/client";
export function normalizeClassroomClientId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value) ? value : undefined;
}
export async function touchClassroomConnection(sessionId: string, userId: string, clientId: string, rejoin = false) {
  const identity = `${userId}:${clientId}`;
  if (!rejoin) {
    // A heartbeat is a lease refresh, not a join or a permission update.
    // The connection lease must refresh even when moderation locks the member.
    // Skip busy rows, and never resurrect a tab that explicitly left.
    const now = new Date();
    await prisma.$executeRaw`
      WITH available AS (
        SELECT c."id" FROM "ClassroomConnection" c
        WHERE c."id" = ${`${sessionId}:${identity}`} AND c."leftAt" IS NULL
          AND EXISTS (SELECT 1 FROM "ClassroomRuntime" r
            WHERE r."sessionId" = ${sessionId} AND r."status" <> 'ended')
        FOR UPDATE OF c SKIP LOCKED
      ), refreshed AS (
        UPDATE "ClassroomConnection" c SET "lastSeenAt" = ${now}
        WHERE c."id" = ${`${sessionId}:${identity}`} AND c."leftAt" IS NULL
          AND EXISTS (SELECT 1 FROM available)
        RETURNING c."id"
      ), eligible AS (
        SELECT m."id" FROM "ClassroomMemberState" m
        WHERE m."sessionId" = ${sessionId} AND m."userId" = ${userId}
          AND EXISTS (SELECT 1 FROM refreshed)
        FOR UPDATE OF m SKIP LOCKED
      )
      UPDATE "ClassroomMemberState" m SET "presence" = 'online', "lastSeenAt" = ${now}
      WHERE m."id" IN (SELECT "id" FROM eligible) AND EXISTS (SELECT 1 FROM refreshed)
    `;
    return;
  }
  const values = { sessionId, userId, rtcUid: classroomRtcUid(identity, "camera"), screenUid: classroomRtcUid(identity, "screen"), lastSeenAt: new Date(), leftAt: null };
  // Scope the row key to authenticated identity; a supplied tab id cannot overwrite another user.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
    await tx.$queryRaw`SELECT "id" FROM "ClassroomMemberState" WHERE "sessionId" = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
    await tx.classroomMemberState.updateMany({ where: { sessionId, userId }, data: { presence: "online", lastSeenAt: values.lastSeenAt } });
    await tx.classroomConnection.upsert({ where: { id: `${sessionId}:${identity}` }, create: { id: `${sessionId}:${identity}`, ...values }, update: values });
  }, { maxWait: 1_500, timeout: 3_500 });
}
export async function leaveClassroomConnection(sessionId: string, userId: string, clientId?: string, voluntary = false) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
    // Match moderation's lock order before releasing a publisher's slot.
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "ClassroomMemberState" WHERE "sessionId" = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId }, select: { composition: true } });
    const composition = normalizeClassroomComposition(runtime?.composition);
    if (composition.screenShares) {
      const remaining = Object.entries(composition.screenShares).filter(([, lease]) =>
        lease.userId !== userId || (clientId && lease.clientId !== clientId));
      if (remaining.length !== Object.keys(composition.screenShares).length) {
        await tx.classroomRuntime.update({ where: { sessionId }, data: {
          composition: { ...composition, screenShares: Object.fromEntries(remaining) } as unknown as Prisma.InputJsonValue,
          revision: { increment: 1 },
        } });
      }
    }
    const now = new Date();
    const departed = await tx.classroomConnection.updateMany({ where: { sessionId, userId, leftAt: null, ...(clientId ? { id: `${sessionId}:${userId}:${clientId}` } : {}) }, data: { leftAt: now } });
    if (departed.count) {
      const member = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId, userId } }, select: { role: true } });
      await enqueueClassroomEvent(tx, sessionId, "classroom.user_left", voluntary ? "user_leave" : "pagehide", { userId, role: member?.role ?? "student" }, `${userId}:${clientId ?? "all"}:${now.toISOString()}`);
    }
    const active = await tx.classroomConnection.count({ where: { sessionId, userId, leftAt: null, lastSeenAt: { gte: new Date(Date.now() - 45_000) } } });
    if (!active) {
      await tx.classroomMemberState.updateMany({ where: { sessionId, userId }, data: { presence: "offline", ...(voluntary ? { onStage: false, stageState: "offstage", handRaisedAt: null, screenShareState: "idle", whiteboardWritable: false } : {}) } });
      await tx.classroomRuntime.updateMany({ where: { sessionId }, data: { revision: { increment: 1 } } });
    }
  }, { maxWait: 1_500, timeout: 3_500 });
}
