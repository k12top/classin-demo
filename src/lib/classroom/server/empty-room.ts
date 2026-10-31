import "server-only";
import { classroomRedisEnabled, classroomRedisCommand } from "./redis";
import { claimRedisEmptyClassroom, releaseRedisEmptyClassroom } from "./redis-presence";
import { Prisma } from "@prisma/client";
import { CLASSROOM_RECONNECT_WINDOW_MS } from "../presence";
import { prisma } from "@/lib/db";
import { CourseStatus } from "@/lib/course-status";
import { classroomEmptyGraceMs, classroomEmptySince } from "../empty-room-policy";
import { enqueueClassroomEvent } from "./integration-events";

/** Only lessons past their scheduled end may close for an empty room.
 * A healthy Redis absence fence precedes the durable human-connection recheck.
 * PG-only mode serializes against join/heartbeat/end. Recorder auth never registers these rows. */
export async function closeEmptyClassrooms(courseIds?: string[], now = new Date()) {
  const grace = classroomEmptyGraceMs();
  if (!grace) return 0;
  if (classroomRedisEnabled() && await classroomRedisCommand(["PING"]) !== "PONG") return 0;
  const candidates = await prisma.$queryRaw<Array<{ sessionId: string }>>`
    SELECT r."sessionId" FROM "ClassroomRuntime" r
    JOIN "CourseSession" s ON s."id" = r."sessionId"
    WHERE r."status" = 'live' AND r."startedAt" IS NOT NULL
      AND s."status" = 'live' AND s."endTime" <= ${now}
      ${courseIds?.length ? Prisma.sql`AND r."courseId" IN (${Prisma.join(courseIds)})` : Prisma.empty}
      AND EXISTS (SELECT 1 FROM "ClassroomConnection" c JOIN "ClassroomMemberState" m
        ON m."sessionId" = c."sessionId" AND m."userId" = c."userId"
        WHERE c."sessionId" = r."sessionId" AND m."role" IN ('teacher','assistant','student'))
      AND NOT EXISTS (SELECT 1 FROM "ClassroomConnection" c JOIN "ClassroomMemberState" m
        ON m."sessionId" = c."sessionId" AND m."userId" = c."userId"
        WHERE c."sessionId" = r."sessionId" AND m."role" IN ('teacher','assistant','student')
          AND c."leftAt" IS NULL AND c."lastSeenAt" > ${new Date(now.getTime() - CLASSROOM_RECONNECT_WINDOW_MS)})
    ORDER BY r."updatedAt" ASC LIMIT 50`;
  let closed = 0;
  for (const { sessionId } of candidates) {
    const fence = crypto.randomUUID();
    if (classroomRedisEnabled() && !await claimRedisEmptyClassroom(sessionId, fence, grace)) continue;
    let result = false;
    try { result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
      const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId } });
      if (runtime?.status !== "live" || !runtime.startedAt) return false;
      // An extension/reschedule may commit after candidate selection. Lock and
      // re-read the authoritative lesson deadline before observing or closing.
      await tx.$queryRaw`SELECT "id" FROM "CourseSession" WHERE "id" = ${sessionId} FOR UPDATE`;
      const lesson = await tx.courseSession.findUnique({ where: { id: sessionId }, select: { status: true, endTime: true } });
      if (lesson?.status !== CourseStatus.LIVE || lesson.endTime.getTime() > now.getTime()) return false;
      const members = await tx.classroomMemberState.findMany({ where: { sessionId, role: { in: ["teacher", "assistant", "student"] } }, select: { userId: true, role: true } });
      // Identity comes from the authenticated join path, not RTC UIDs or display names.
      const connections = await tx.classroomConnection.findMany({ where: { sessionId, userId: { in: members.map(member => member.userId) } }, select: { userId: true, lastSeenAt: true, leftAt: true, leaveIntent: true, replacedAt: true } });
      const teachers = new Set(members.filter(member => member.role === "teacher" || member.role === "assistant").map(member => member.userId));
      // Explicit temporary leave reserves the room until return or the hard lesson deadline.
      if (connections.some(connection => teachers.has(connection.userId) && !connection.replacedAt && connection.leftAt &&
          connection.leaveIntent === "temporary" && (connection.lastSeenAt >= runtime.startedAt! || connection.leftAt >= runtime.startedAt!))) return false;
      const since = classroomEmptySince(connections, now.getTime());
      const noticeId = `classroom-empty:${sessionId}`;
      if (since === null) return false;
      const observation = await tx.classroomProviderEvent.findUnique({ where: { noticeId } });
      const payload = observation?.payload as { observedAt?: number; lastActivity?: number } | undefined;
      const lastActivity = Math.max(...connections.map(connection => Math.max(connection.lastSeenAt.getTime(), connection.leftAt?.getTime() ?? 0)));
      // First observation starts a durable grace window, protecting rollout, stale
      // caches and connection cleanup. A real join/heartbeat cancels it below.
      const observedAt = payload?.lastActivity === lastActivity && typeof payload.observedAt === "number" ? payload.observedAt : now.getTime();
      if (observedAt === now.getTime()) await tx.classroomProviderEvent.upsert({ where: { noticeId },
        create: { noticeId, provider: "classroom-empty", category: "absence", payload: { observedAt, lastActivity }, processedAt: now },
        update: { payload: { observedAt, lastActivity }, processedAt: now } });
      // Even an observation retained from before an extension must not consume
      // the new lesson's post-end grace window.
      if (now.getTime() - Math.max(since, observedAt, lesson.endTime.getTime()) < grace) return false;
      const changed = await tx.courseSession.updateMany({ where: { id: sessionId, status: CourseStatus.LIVE, endTime: { lte: now } },
        data: { status: CourseStatus.FINISHED, endedAt: now } });
      if (!changed.count) return false;
      await tx.classroomRuntime.update({ where: { sessionId }, data: { status: "ended", revision: { increment: 1 } } });
      await enqueueClassroomEvent(tx, sessionId, "classroom.ended", "empty_room");
      return true;
    }, { maxWait: 1_000, timeout: 8_000 });
    } finally { if (classroomRedisEnabled()) await releaseRedisEmptyClassroom(sessionId, fence, result); }
    if (result) closed++;
  }
  return closed;
}
