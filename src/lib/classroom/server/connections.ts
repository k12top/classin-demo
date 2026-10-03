import "server-only";
import { prisma } from "@/lib/db";
import { enqueueClassroomEvent } from "./integration-events";
import { classroomRtcUid } from "@/lib/classroom/rtc-uid";
export function normalizeClassroomClientId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value) ? value : undefined;
}
export async function touchClassroomConnection(sessionId: string, userId: string, clientId: string, rejoin = false) {
  const identity = `${userId}:${clientId}`;
  const values = { sessionId, userId, rtcUid: classroomRtcUid(identity, "camera"), screenUid: classroomRtcUid(identity, "screen"), lastSeenAt: new Date(), leftAt: null };
  // Scope the row key to authenticated identity; a supplied tab id cannot overwrite another user.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomMemberState" WHERE "sessionId" = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.classroomConnection.findUnique({ where: { id: `${sessionId}:${identity}` }, select: { leftAt: true } });
    if (existing?.leftAt && !rejoin) return;
    await tx.classroomMemberState.updateMany({ where: { sessionId, userId }, data: { presence: "online", lastSeenAt: values.lastSeenAt } });
    await tx.classroomConnection.upsert({ where: { id: `${sessionId}:${identity}` }, create: { id: `${sessionId}:${identity}`, ...values }, update: values });
  });
}
export async function leaveClassroomConnection(sessionId: string, userId: string, clientId?: string, voluntary = false) {
  await prisma.$transaction(async (tx) => {
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
  });
}
