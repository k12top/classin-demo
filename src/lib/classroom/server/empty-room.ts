import "server-only";
import { Prisma } from "@prisma/client";
import { CLASSROOM_RECONNECT_WINDOW_MS } from "../presence";
import { prisma } from "@/lib/db";
import { CourseStatus } from "@/lib/course-status";
import { classroomEmptyGraceMs, classroomEmptySince } from "../empty-room-policy";
import { enqueueClassroomEvent } from "./integration-events";

/** All decisions use persisted human connections, serialized against join/heartbeat/end.
 * No browser timer or in-memory countdown. Recorder session auth never registers these rows. */
export async function closeEmptyClassrooms(courseIds?: string[], now = new Date()) {
  const grace = classroomEmptyGraceMs();
  if (!grace) return 0;
  const candidates = await prisma.$queryRaw<Array<{ sessionId: string }>>`
    SELECT r."sessionId" FROM "ClassroomRuntime" r
    WHERE r."status" = 'live' AND r."startedAt" IS NOT NULL
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
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
      const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId } });
      if (runtime?.status !== "live" || !runtime.startedAt) return false;
      const members = await tx.classroomMemberState.findMany({ where: { sessionId, role: { in: ["teacher", "assistant", "student"] } }, select: { userId: true } });
      // Identity comes from the authenticated join path, not RTC UIDs or display names.
      const connections = await tx.classroomConnection.findMany({ where: { sessionId, userId: { in: members.map(member => member.userId) } }, select: { lastSeenAt: true, leftAt: true } });
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
      if (now.getTime() - Math.max(since, observedAt) < grace) return false;
      const changed = await tx.courseSession.updateMany({ where: { id: sessionId, status: CourseStatus.LIVE },
        data: { status: CourseStatus.FINISHED, endedAt: now } });
      if (!changed.count) return false;
      await tx.classroomRuntime.update({ where: { sessionId }, data: { status: "ended", revision: { increment: 1 } } });
      await enqueueClassroomEvent(tx, sessionId, "classroom.ended", "empty_room");
      return true;
    }, { timeout: 10_000 });
    if (result) closed++;
  }
  return closed;
}
