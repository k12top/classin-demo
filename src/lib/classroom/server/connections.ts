import "server-only";
import { prisma } from "@/lib/db";
import { enqueueClassroomEvent } from "./integration-events";
import { classroomRtcUid } from "@/lib/classroom/rtc-uid";
export function normalizeClassroomClientId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value) ? value : undefined;
}
export async function touchClassroomConnection(sessionId: string, userId: string, clientId: string, rejoin = false) {
  const identity = `${userId}:${clientId}`;
  if (!rejoin) {
    // A heartbeat is a lease refresh, not a join or a permission update.
    // Skip a busy member row rather than holding a pool connection behind a
    // teacher action. The next heartbeat retries without resurrecting a left tab.
    await prisma.$executeRaw`
      WITH eligible AS (
        SELECT m."id" FROM "ClassroomMemberState" m
        JOIN "ClassroomRuntime" r ON r."sessionId" = m."sessionId"
        WHERE m."sessionId" = ${sessionId} AND m."userId" = ${userId}
          AND r."status" <> 'ended'
          AND EXISTS (SELECT 1 FROM "ClassroomConnection" c
            WHERE c."id" = ${`${sessionId}:${identity}`} AND c."leftAt" IS NULL)
        FOR UPDATE OF m SKIP LOCKED
      ), refreshed AS (
        UPDATE "ClassroomConnection" c SET "lastSeenAt" = NOW()
        WHERE c."id" = ${`${sessionId}:${identity}`} AND c."leftAt" IS NULL
          AND EXISTS (SELECT 1 FROM eligible)
        RETURNING c."id"
      )
      UPDATE "ClassroomMemberState" m SET "presence" = 'online', "lastSeenAt" = NOW()
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
    await tx.$queryRaw`SELECT "id" FROM "ClassroomMemberState" WHERE "sessionId" = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
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
