import "server-only";
import { ClassroomConnectionEndedError, ClassroomConnectionReplacedError, ClassroomDeviceConflictError } from "./errors";
import { prisma } from "@/lib/db";
import { refreshCaptionDemand } from "./caption-demand";
import { classroomPgFallback, classroomRedisEnabled } from "./redis";
import { redisClassroomHeartbeat } from "./redis-presence";
import { synchronizeClassroomRedis, registerClassroomRedisConnection } from "./redis-sync";
import { enqueueClassroomEvent } from "./integration-events";
import { classroomRtcUid } from "@/lib/classroom/rtc-uid";
import { normalizeClassroomComposition } from "@/lib/classroom/composition";
import type { Prisma } from "@prisma/client";
import { CLASSROOM_RECONNECT_WINDOW_MS } from "@/lib/classroom/presence";
import type { ClassroomDeviceEntryMode } from "@/lib/classroom/device-admission";
import type { ClassroomLeaveIntent } from "../overtime-leave";
import { endOvertimeAfterTeacherLeave } from "./overtime-leave";
export function normalizeClassroomClientId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value) ? value : undefined;
}
export async function classroomConnectionReplaced(sessionId: string, userId: string, clientId?: string) {
  if (!clientId) return false;
  const connection = await prisma.classroomConnection.findUnique({ where: { id: `${sessionId}:${userId}:${clientId}` }, select: { replacedAt: true } });
  return Boolean(connection?.replacedAt);
}

type DeviceAdmission = { deviceId?: string; deviceLabel?: string; mode?: ClassroomDeviceEntryMode };
export function touchClassroomConnection(sessionId: string, userId: string, clientId: string, rejoin: true, admission?: DeviceAdmission): Promise<{ entryMode: "primary" | ClassroomDeviceEntryMode }>;
export function touchClassroomConnection(sessionId: string, userId: string, clientId: string, rejoin?: false): Promise<{ status: string; refreshed: boolean; reason: string }>;
export async function touchClassroomConnection(sessionId: string, userId: string, clientId: string, rejoin = false,
  admission?: DeviceAdmission) {
  const identity = `${userId}:${clientId}`;
  if (!rejoin) {
    if (classroomRedisEnabled()) {
      // The automatic closer now fences Redis renewals before its durable recheck.
      const cached = await redisClassroomHeartbeat(sessionId, userId, clientId);
      if (cached) return cached;
      return { status: "unknown", refreshed: false, reason: "busy" };
    }
    // A heartbeat is a lease refresh, not a join or a permission update.
    // The connection lease must refresh even when moderation locks the member.
    // Skip busy rows, and never resurrect a tab that explicitly left.
    const now = new Date();
    const [result] = await classroomPgFallback(`heartbeat:${sessionId}:${identity}`, () => prisma.$queryRaw<Array<{ status: string | null; refreshed: boolean; registered: boolean; leftAt: Date | null; replacedAt: Date | null }>>`
      WITH runtime_state AS (
        SELECT "status" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR SHARE SKIP LOCKED
      ), available AS (
        SELECT c."id" FROM "ClassroomConnection" c
        WHERE c."id" = ${`${sessionId}:${identity}`} AND c."leftAt" IS NULL
          AND EXISTS (SELECT 1 FROM runtime_state WHERE "status" <> 'ended')
        FOR UPDATE OF c SKIP LOCKED
      ), refreshed AS (
        UPDATE "ClassroomConnection" c SET "lastSeenAt" = GREATEST(c."lastSeenAt", ${now})
        WHERE c."id" = ${`${sessionId}:${identity}`} AND c."leftAt" IS NULL
          AND EXISTS (SELECT 1 FROM available)
        RETURNING c."id"
      ), eligible AS (
        SELECT m."id" FROM "ClassroomMemberState" m
        WHERE m."sessionId" = ${sessionId} AND m."userId" = ${userId}
          AND EXISTS (SELECT 1 FROM refreshed)
          AND (m."presence" <> 'online' OR m."lastSeenAt" < ${new Date(now.getTime() - 30_000)})
        FOR UPDATE OF m SKIP LOCKED
      ), member_refresh AS (
        UPDATE "ClassroomMemberState" m SET "presence" = 'online', "lastSeenAt" = GREATEST(m."lastSeenAt", ${now})
        WHERE m."id" IN (SELECT "id" FROM eligible) RETURNING m."id"
      )
      SELECT (SELECT "status" FROM runtime_state) AS "status",
        EXISTS (SELECT 1 FROM refreshed) AS "refreshed",
        EXISTS (SELECT 1 FROM "ClassroomConnection" WHERE "id" = ${`${sessionId}:${identity}`}) AS "registered",
        (SELECT "leftAt" FROM "ClassroomConnection" WHERE "id" = ${`${sessionId}:${identity}`}) AS "leftAt",
        (SELECT "replacedAt" FROM "ClassroomConnection" WHERE "id" = ${`${sessionId}:${identity}`}) AS "replacedAt"
    `);
    return { status: result?.status ?? "missing", refreshed: result?.refreshed === true,
      reason: result?.refreshed ? "refreshed" : result?.status === "ended" ? "ended" : !result?.registered ? "missing" : result.replacedAt ? "replaced" : result.leftAt ? "left" : "busy" };
  }
  const values = { sessionId, userId, rtcUid: classroomRtcUid(identity, "camera"), screenUid: classroomRtcUid(identity, "screen"), lastSeenAt: new Date(), leftAt: null, leaveIntent: null };
  // Scope the row key to authenticated identity; a supplied tab id cannot overwrite another user.
  const joined = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId }, select: { status: true } });
    if (!runtime || runtime.status === "ended") throw new ClassroomConnectionEndedError();
    await tx.$queryRaw`SELECT "id" FROM "ClassroomMemberState" WHERE "sessionId" = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
    const id = `${sessionId}:${identity}`;
    const own = await tx.classroomConnection.findUnique({ where: { id } });
    // Replaced tabs cannot resurrect themselves through bootstrap retries.
    if (own?.replacedAt) throw new ClassroomConnectionReplacedError();
    const existing = admission ? await tx.classroomConnection.findMany({ where: {
      sessionId, userId, id: { not: id }, replacedAt: null,
      // Background throttling is not proof that an open RTC device has left.
      OR: [{ leftAt: null }, { lastSeenAt: { gte: new Date(Date.now() - CLASSROOM_RECONNECT_WINDOW_MS) } }],
    } }) : [];
    const sameDevice = admission?.deviceId ? existing.find(row => row.deviceId === admission.deviceId) : undefined;
    const others = existing.filter(row => !row.leftAt && (!admission?.deviceId || row.deviceId !== admission.deviceId));
    const continuing = Boolean(own && !own.leftAt);
    if (!continuing && admission && others.length && !sameDevice && !admission.mode) {
      throw new ClassroomDeviceConflictError([...new Set(others.map(row => row.deviceLabel || ""))]);
    }
    const mode = continuing ? own!.entryMode || "primary" : admission?.mode || sameDevice?.entryMode || "primary";
    // Repeat responses are idempotent: a retry must not evict devices that
    // joined after the original replacement committed.
    const replaced = !continuing && admission && (mode === "replace" || admission.deviceId)
      ? await tx.classroomConnection.findMany({ where: { sessionId, userId, id: { not: id }, replacedAt: null,
        ...(admission.mode === "replace" ? {} : { deviceId: admission.deviceId || "" }) } }) : [];
    if (replaced.length) {
      await tx.classroomConnection.updateMany({ where: { id: { in: replaced.map(row => row.id) } }, data: {
        leftAt: values.lastSeenAt, replacedAt: values.lastSeenAt, captionLanguage: null,
      } });
      const current = await tx.classroomRuntime.findUniqueOrThrow({ where: { sessionId }, select: { composition: true } });
      const composition = normalizeClassroomComposition(current.composition);
      const replacedClients = new Set(replaced.map(row => row.id.slice(`${sessionId}:${userId}:`.length)));
      const screenShares = Object.fromEntries(Object.entries(composition.screenShares || {}).filter(([, lease]) =>
        lease.userId !== userId || !replacedClients.has(lease.clientId)));
      await tx.classroomRuntime.update({ where: { sessionId }, data: {
        composition: { ...composition, screenShares } as unknown as Prisma.InputJsonValue, revision: { increment: 1 },
      } });
      await refreshCaptionDemand(tx, sessionId);
    }
    if (admission && !continuing && !replaced.length) {
      await tx.classroomRuntime.update({ where: { sessionId }, data: { revision: { increment: 1 } } });
    }
    await tx.classroomMemberState.updateMany({ where: { sessionId, userId }, data: { presence: "online", lastSeenAt: values.lastSeenAt } });
    const metadata = admission ? { deviceId: admission.deviceId, deviceLabel: admission.deviceLabel, entryMode: mode } : {};
    await tx.classroomConnection.upsert({ where: { id }, create: { id, ...values, ...metadata }, update: { ...values, ...metadata } });
    await tx.classroomProviderEvent.updateMany({ where: { noticeId: `classroom-empty:${sessionId}` },
      data: { payload: { cancelledAt: values.lastSeenAt.getTime() } } });
    return { entryMode: mode as "primary" | ClassroomDeviceEntryMode };
  }, { maxWait: 1_500, timeout: 3_500 });
  await registerClassroomRedisConnection(sessionId, `${sessionId}:${identity}`);
  // Publish the tombstones as well as the new lease before old Redis heartbeats.
  if (admission) await synchronizeClassroomRedis(sessionId, true);
  return joined;
}
export async function leaveClassroomConnection(sessionId: string, userId: string, clientId?: string, voluntary = false,
  departure?: { intent: ClassroomLeaveIntent; cycleStartedAt: string }) {
  const ended = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
    // Match moderation's lock order before releasing a publisher's slot.
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "ClassroomMemberState" WHERE "sessionId" = ${sessionId} AND "userId" = ${userId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId }, select: { composition: true, startedAt: true, status: true } });
    // A delayed command from a previous class cycle cannot remove a new connection.
    if (departure && runtime?.startedAt?.toISOString() !== departure.cycleStartedAt) return null;
    const connectionId = clientId ? `${sessionId}:${userId}:${clientId}` : undefined;
    const connection = connectionId ? await tx.classroomConnection.findUnique({ where: { id: connectionId } }) : null;
    // Old replaced devices and duplicate pagehide/leave commands have no lifecycle authority.
    if (connectionId && (!connection || connection.replacedAt)) return null;
    if (departure && runtime?.startedAt && connection?.leftAt && connection.leftAt < runtime.startedAt) return null;
    if (connection?.leftAt) {
      // pagehide may overtake the explicit HTTP request during navigation/window close.
      // Promote only that non-voluntary tombstone; never overwrite an explicit choice.
      if (!voluntary || !departure || connection.leaveIntent !== "disconnected") return null;
      await tx.classroomConnection.update({ where: { id: connection.id }, data: { leaveIntent: departure.intent } });
      return departure.intent === "finishIfLastTeacher" ? endOvertimeAfterTeacherLeave(tx, sessionId, userId, new Date()) : null;
    }
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
    const departed = await tx.classroomConnection.updateMany({ where: { sessionId, userId, leftAt: null, replacedAt: null, ...(connectionId ? { id: connectionId } : {}) },
      data: { leftAt: now, leaveIntent: voluntary ? departure?.intent ?? "temporary" : "disconnected" } });
    await refreshCaptionDemand(tx, sessionId);
    // A delayed pagehide after explicit leave must not reopen the grace period.
    if (!departed.count) return null;
    if (departed.count) {
      const member = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId, userId } }, select: { role: true } });
      await enqueueClassroomEvent(tx, sessionId, "classroom.user_left", voluntary ? "user_leave" : "pagehide", { userId, role: member?.role ?? "student" }, `${userId}:${clientId ?? "all"}:${now.toISOString()}`);
    }
    const active = await tx.classroomConnection.count({ where: { sessionId, userId, leftAt: null, lastSeenAt: { gte: new Date(Date.now() - CLASSROOM_RECONNECT_WINDOW_MS) } } });
    if (!active) {
      const member = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId, userId } }, select: { stageState: true, onStage: true } });
      const preserveStage = member && (["removed", "declined"].includes(member.stageState) || (!member.onStage && member.stageState === "offstage"));
      const stageState = preserveStage ? member!.stageState : "left";
      await tx.classroomMemberState.updateMany({ where: { sessionId, userId }, data: { presence: voluntary ? "offline" : "reconnecting", lastSeenAt: now, ...(voluntary ? { onStage: false, stageState, handRaisedAt: null, screenShareState: "idle", whiteboardWritable: false } : {}) } });
      await tx.classroomRuntime.updateMany({ where: { sessionId }, data: { revision: { increment: 1 } } });
    }
    return voluntary && departure?.intent === "finishIfLastTeacher" && connectionId
      ? endOvertimeAfterTeacherLeave(tx, sessionId, userId, now) : null;
  }, { maxWait: 1_500, timeout: 8_000 });
  // An already committed departure/end must not appear to fail because Redis is unavailable.
  await synchronizeClassroomRedis(sessionId, true).catch(() => {
    console.warn("[classroom:leave] Redis synchronization pending", { sessionId });
  });
  return ended;
}
