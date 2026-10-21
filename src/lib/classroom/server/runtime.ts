import { readClassroomCommand, saveClassroomCommand } from "./command-receipt";
import { classroomRtcUid } from "@/lib/classroom/rtc-uid";
import { classroomSignalingUserId } from "@/lib/classroom/signaling/identity";
import "server-only";
import { refreshCoursewareConversions } from "@/lib/courseware-conversion";
import { classroomActionRequiresRevision } from "@/lib/classroom/action-request";
import { enqueueClassroomEvent } from "./integration-events";
import { classroomMemberPresence } from "@/lib/classroom/session-lifecycle";
import { CLASSROOM_ONLINE_WINDOW_MS, CLASSROOM_RECONNECT_WINDOW_MS, classroomConnectionPresence } from "@/lib/classroom/presence";
import { classroomSharedRead } from "./shared-cache";
import { readRedisClassroomPresence, overlayRedisClassroomPresence, type RedisConnectionLease } from "./redis-presence";
import { synchronizeClassroomRedis } from "./redis-sync";

import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";

import type {
  ClassroomAction,
  ClassroomCoursewareSnapshot,
  ClassroomEngagementSnapshot,
  ClassroomMemberSnapshot,
  ClassroomRole,
  ClassroomRuntimeSnapshot,
  ClassroomStageMode,
} from "@/lib/classroom/types";
import {
  classroomGraceEndAt,
} from "@/lib/classroom/policy";
import {
  classroomModePolicy,
  type ClassroomModePolicy,
} from "@/lib/classroom/mode";
import { CourseStatus } from "@/lib/course-status";
import {
  normalizeRecordingStartMode,
} from "@/lib/classroom/recording-start";
import { normalizeClassStartMode, scheduledClassStartDue } from "@/lib/classroom/class-start";
import { prisma } from "@/lib/db";
import {
  SCREEN_SHARE_REQUEST_TTL_MS,
  canShareClassroomScreen,
  ownsScreenShare,
  screenShareStateAfter,
} from "@/lib/classroom/screen-share-state";
import type { SessionPayload } from "@/lib/session";
import {
  normalizeClassroomLanguage,
  normalizeTargetLanguages,
} from "@/lib/classroom/languages";
import { captionDemandTargets } from "./caption-demand";
import { captionTranslationLimit, supportsCaptionTranslation } from "@/lib/classroom/translation-capabilities";
import { classroomSelectorCycle } from "@/lib/classroom/engagement";
import {
  arrangeClassroomVideoGallery,
  bringClassroomBoardItemToFront,
  defaultBoardRect,
  emptyClassroomComposition,
  normalizeClassroomComposition,
  orderClassroomSeats,
  placeClassroomBoardItem,
  touchComposition,
  updateClassroomBoardItem,
} from "@/lib/classroom/composition";

const ONLINE_WINDOW_MS = CLASSROOM_ONLINE_WINDOW_MS;

function compositionJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class ClassroomRevisionConflictError extends Error {
  constructor(public readonly actualRevision: number) {
    super("Classroom state changed");
    this.name = "ClassroomRevisionConflictError";
  }
}

export class ClassroomActionError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ClassroomActionError";
  }
}

export async function ensureClassroomRuntime(
  courseId: string,
  sessionId = courseId,
) {
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    select: { id: true, status: true, startTime: true, endTime: true },
  });
  if (!lesson) throw new ClassroomActionError("课次不存在", 404);

  const ended =
    lesson.status === CourseStatus.FINISHED ||
    lesson.status === CourseStatus.CANCELLED;
  const graceEndsAt = classroomGraceEndAt(lesson.endTime);
  const existing = await prisma.classroomRuntime.findUnique({ where: { sessionId } });
  // Most callers are classroom polls. Avoid rewriting/locking the same row on
  // every read; only an actual lifecycle or schedule change needs a transaction.
  const unchanged = existing &&
    existing.graceEndsAt?.getTime() === graceEndsAt?.getTime() &&
    (!ended || existing.status === "ended");
  const runtime = unchanged ? existing : await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const previous = await tx.classroomRuntime.findUnique({ where: { sessionId }, select: { status: true } });
    const runtime = await tx.classroomRuntime.upsert({
      where: { sessionId },
      create: {
        courseId,
        sessionId,
        status: ended ? "ended" : "waiting",
        graceEndsAt: classroomGraceEndAt(lesson.endTime),
        startedAt: null,
        targetLanguages: [],
      },
      update: {
        graceEndsAt: classroomGraceEndAt(lesson.endTime),
        ...(ended ? { status: "ended" } : {}),
      },
    });
    if (ended) {
      await queueEndedRecordingStops(tx, sessionId);
    }
    if (ended && previous && previous.status !== "ended") await enqueueClassroomEvent(tx, sessionId, "classroom.ended", lesson.status === CourseStatus.CANCELLED ? "cancelled" : "scheduled_end");
    return runtime;
  });

  if (
    runtime.status !== "ended" &&
    runtime.graceEndsAt &&
    runtime.graceEndsAt.getTime() <= Date.now()
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
      await tx.courseSession.update({ where: { id: sessionId }, data: { status: CourseStatus.FINISHED } });
      const endedRuntime = await tx.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "ended", revision: { increment: 1 } } });
      await queueEndedRecordingStops(tx, sessionId);
      await enqueueClassroomEvent(tx, sessionId, "classroom.ended", "scheduled_end");
      return endedRuntime;
    });
    return updated;
  }
  return runtime;
}

async function queueEndedRecordingStops(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.classroomRecording.updateMany({
    where: { sessionId, status: { in: ["starting", "recording"] } },
    data: {
      status: "stopping",
      stopRequestedAt: new Date(),
      lastProviderCheckAt: null,
    },
  });
}

// The browser reports readiness only while its RTC and required whiteboard are ready.
// Passive polls and cron jobs cannot start a lesson without that authenticated signal.
export async function startScheduledClassroomIfDue(
  sessionId: string,
  readyTeacher: { userId: string; clientId: string },
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUnique({
      where: { sessionId },
      include: { session: { select: { status: true, startTime: true, endTime: true } } },
    });
    if (!runtime || runtime.status !== "waiting" ||
      !scheduledClassStartDue(runtime.classStartMode, runtime.session.startTime, runtime.session.endTime, now) ||
      (runtime.session.status !== CourseStatus.SCHEDULED && runtime.session.status !== CourseStatus.LIVE)
    ) return false;
    const member = await tx.classroomMemberState.findUnique({
      where: { sessionId_userId: { sessionId, userId: readyTeacher.userId } }, select: { role: true },
    });
    const connection = await tx.classroomConnection.findFirst({ where: {
      id: `${sessionId}:${readyTeacher.userId}:${readyTeacher.clientId}`,
      sessionId, userId: readyTeacher.userId, leftAt: null,
      lastSeenAt: { gte: new Date(now.getTime() - ONLINE_WINDOW_MS) },
    }, select: { id: true } });
    if (member?.role !== "teacher" || !connection) return false;
    const claimedLesson = await tx.courseSession.updateMany({
      where: { id: sessionId, status: { in: [CourseStatus.SCHEDULED, CourseStatus.LIVE] }, startTime: { lte: now }, endTime: { gt: now } },
      data: { status: CourseStatus.LIVE, endedAt: null },
    });
    if (!claimedLesson.count) return false;
    await tx.classroomRuntime.update({ where: { id: runtime.id }, data: {
      status: "live", startedAt: now,
      graceEndsAt: classroomGraceEndAt(runtime.session.endTime),
      interpretationEnabled: true,
      targetLanguages: await captionDemandTargets(tx, sessionId, runtime.sourceLanguage, runtime.interpretationProvider === "wordly" ? "wordly" : "shengwang"),
      transcriptionStatus: "starting", transcriptionError: null, transcriptionLastCheckedAt: null,
      revision: { increment: 1 },
    } });
    await tx.course.updateMany({ where: { id: runtime.courseId, status: CourseStatus.SCHEDULED }, data: { status: CourseStatus.LIVE } });
    await enqueueClassroomEvent(tx, sessionId, "classroom.started", "scheduled_start");
    return true;
  });
}

export async function touchClassroomMember(
  courseId: string,
  session: Pick<
    SessionPayload,
    "userId" | "displayName" | "name" | "avatar"
  >,
  role: ClassroomRole,
  suppliedModePolicy?: ClassroomModePolicy,
  sessionId = courseId,
  joining = false,
) {
  const [runtime, course] = await Promise.all([
    ensureClassroomRuntime(courseId, sessionId),
    suppliedModePolicy
      ? Promise.resolve(null)
      : prisma.courseSession.findUnique({
          where: { id: sessionId },
          select: {
            roomType: true,
            course: { select: { autoStudentOnStage: true } },
          },
        }),
  ]);
  const mode =
    suppliedModePolicy ?? classroomModePolicy(
      course?.roomType ?? 4,
      course?.course.autoStudentOnStage,
    );
  const teachingRole = role === "teacher" || role === "assistant";
  const assistantStartsOnStage =
    role === "assistant" && mode.mode !== "largeClass";
  const studentStartsOnStage =
    role === "student" && mode.defaultStudentOnStage;
  const teachingStartsOnStage = role === "teacher" || assistantStartsOnStage;
  const upsertInput = (startsOnStage: boolean, restoreStage = false, restoreMedia = false) => ({
    where: { sessionId_userId: { sessionId, userId: session.userId } },
    create: {
      runtimeId: runtime.id,
      courseId,
      sessionId,
      userId: session.userId,
      displayName: session.displayName || session.name || session.userId,
      avatar: session.avatar || "",
      role,
      presence: "online",
      onStage: startsOnStage,
      stageState: startsOnStage ? "accepted" : studentStartsOnStage ? "waiting" : "offstage",
      microphoneAllowed: startsOnStage,
      cameraAllowed: startsOnStage,
      // Teachers and assistants always retain their authoring capability.
      // Students start read-only, including students automatically placed on
      // stage in a one-to-one room. A teaching role grants their temporary
      // annotation access through `setWhiteboardWritable` instead.
      whiteboardWritable: teachingRole,
    },
    update: {
      runtimeId: runtime.id,
      displayName: session.displayName || session.name || session.userId,
      avatar: session.avatar || "",
      role,
      presence: "online",
      lastSeenAt: new Date(),
      ...((teachingStartsOnStage || restoreStage)
        ? {
            onStage: true,
            stageState: "accepted",
            ...((teachingStartsOnStage || restoreMedia) ? { microphoneAllowed: true, cameraAllowed: true } : {}),
            // Do not reset a student's temporary grant every time their
            // classroom session refreshes. Teaching roles are made writable
            // defensively in case their roster role changed since joining.
            ...(teachingRole ? { whiteboardWritable: true } : {}),
          }
        : {}),
    },
  });
  if (!studentStartsOnStage) {
    return prisma.classroomMemberState.upsert(
      upsertInput(teachingStartsOnStage),
    );
  }
  const alreadyJoined = await prisma.classroomMemberState.findUnique({
    where: { sessionId_userId: { sessionId, userId: session.userId } },
    select: { id: true, stageState: true },
  });
  if (alreadyJoined && !(joining && ["left", "waiting"].includes(alreadyJoined.stageState))) {
    return prisma.classroomMemberState.upsert(upsertInput(false));
  }
  const redisPresence = await readRedisClassroomPresence(sessionId);
  // Re-evaluate voluntary re-entry and capacity waits only on real joins.
  // Teacher removals and declined invitations survive refreshes and exits.
  // Serialize admissions so simultaneous returns cannot overbook the stage.
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId"=${sessionId} FOR UPDATE`;
    const existing = await tx.classroomMemberState.findUnique({
      where: { sessionId_userId: { sessionId, userId: session.userId } },
      select: { id: true, stageState: true },
    });
    const eligible = !existing || (joining && ["left", "waiting"].includes(existing.stageState));
    const occupiedSeats = eligible ? await countReservedStudentSeats(tx, sessionId, redisPresence) : 0;
    const admit = eligible && occupiedSeats < mode.maxStageStudents;
    return tx.classroomMemberState.upsert(upsertInput(admit, Boolean(existing) && admit, existing?.stageState === "waiting"));
  });
}

function publicMember(
  member: {
    userId: string;
    displayName: string;
    avatar: string;
    role: string;
    presence: string;
    onStage: boolean;
    stageState: string;
    screenShareState: string;
    screenShareRequestedAt: Date | null;
    microphoneAllowed: boolean;
    cameraAllowed: boolean;
    chatMuted: boolean;
    whiteboardWritable: boolean;
    handRaisedAt: Date | null;
    lastSeenAt: Date;
  },
  now = Date.now(),
  rewardCount = 0,
): ClassroomMemberSnapshot {
  const role: ClassroomRole =
    member.role === "teacher" || member.role === "assistant"
      ? member.role
      : "student";
  const stageState =
    member.stageState === "invited" || member.stageState === "accepted"
      ? member.stageState
      : "offstage";
  const requestExpired =
    member.screenShareState === "requested" &&
    (!member.screenShareRequestedAt ||
      now - member.screenShareRequestedAt.getTime() >
        SCREEN_SHARE_REQUEST_TTL_MS);
  const screenShareState = requestExpired
    ? "idle"
    : member.screenShareState === "requested" ||
        member.screenShareState === "accepted" ||
        member.screenShareState === "declined"
      ? member.screenShareState
      : "idle";
  return {
    userId: member.userId,
    displayName: member.displayName || member.userId,
    avatar: member.avatar,
    role,
    ...classroomMemberPresence(member, now, ONLINE_WINDOW_MS),
    stageState,
    screenShareState,
    screenShareRequestedAt: requestExpired
      ? null
      : member.screenShareRequestedAt?.toISOString() ?? null,
    microphoneAllowed: member.microphoneAllowed,
    cameraAllowed: member.cameraAllowed,
    chatMuted: member.chatMuted,
    whiteboardWritable: member.whiteboardWritable,
    handRaisedAt: member.handRaisedAt?.toISOString() ?? null,
    rewardCount,
  };
}

/** Count both reconnecting seats and admissions awaiting their new connection lease. */
async function countReservedStudentSeats(tx: Prisma.TransactionClient, sessionId: string, leases: RedisConnectionLease[] | null) {
  const cutoff = new Date(Date.now() - CLASSROOM_RECONNECT_WINDOW_MS);
  const activeUsers = [...new Set((leases || []).filter(lease => lease.leftAt === null && lease.lastSeenAt >= cutoff.getTime()).map(lease => lease.userId))];
  const [row] = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count FROM "ClassroomMemberState" m
    WHERE m."sessionId" = ${sessionId} AND m."role" = 'student' AND m."onStage" = true
      AND (m."userId" = ANY(${activeUsers}::text[]) OR EXISTS (SELECT 1 FROM "ClassroomConnection" c WHERE c."sessionId" = m."sessionId"
          AND c."userId" = m."userId" AND c."leftAt" IS NULL AND c."lastSeenAt" >= ${cutoff})
        OR (m."lastSeenAt" >= ${cutoff} AND m."presence" IN ('reconnecting', 'online')))
  `;
  return Number(row?.count ?? 0);
}

/** Redis freshness supplements PG membership, but cannot reopen a PG-closed tab. */
async function classroomOnlineMemberFilter(tx: Prisma.TransactionClient, sessionId: string, leases: RedisConnectionLease[] | null): Promise<Prisma.ClassroomMemberStateWhereInput> {
  const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS);
  const ids = (leases || []).filter(lease => lease.leftAt === null && lease.lastSeenAt >= cutoff.getTime()).map(lease => lease.id);
  const registered = ids.length ? await tx.classroomConnection.findMany({
    where: { sessionId, leftAt: null, id: { in: ids } }, select: { userId: true },
  }) : [];
  return { OR: [
    { presence: "online", lastSeenAt: { gte: cutoff } },
    { userId: { in: [...new Set(registered.map(connection => connection.userId))] } },
  ] };
}

export async function getClassroomRuntimeSnapshot(
  courseId: string,
  sessionId = courseId,
  options: { ensure?: boolean; coalesce?: boolean } = {},
): Promise<ClassroomRuntimeSnapshot> {
  if (!options.coalesce) await synchronizeClassroomRedis(sessionId, true);
  const snapshot = options.coalesce
    ? await classroomSharedRead(sessionId, "runtime", () => loadClassroomRuntimeSnapshot(courseId, sessionId, options))
    : await loadClassroomRuntimeSnapshot(courseId, sessionId, options);
  return overlayRedisClassroomPresence(snapshot, await readRedisClassroomPresence(sessionId));
}

async function loadClassroomRuntimeSnapshot(
  courseId: string,
  sessionId: string,
  options: { ensure?: boolean },
): Promise<ClassroomRuntimeSnapshot> {
  if (options.ensure !== false) {
    await ensureClassroomRuntime(courseId, sessionId);
  }
  const runtime = await prisma.classroomRuntime.findUniqueOrThrow({
      where: { sessionId },
      include: {
        members: {
          orderBy: [
            { role: "asc" },
            { onStage: "desc" },
            { handRaisedAt: "asc" },
            { joinedAt: "asc" },
          ],
        },
      },
    });
  const [rewardTotals, connections] = await Promise.all([
    prisma.classroomRewardEvent.groupBy({
      by: ["recipientId"],
      where: { sessionId },
      _sum: { points: true },
    }),
    // Closed-tab history is irrelevant after the grace period. Keep every open
    // RTC identity so an HTTP interruption cannot hide a healthy media peer.
    prisma.classroomConnection.findMany({ where: { sessionId, OR: [
      { leftAt: null }, { leftAt: { gte: new Date(Date.now() - CLASSROOM_RECONNECT_WINDOW_MS) } },
    ] } }),
  ]);
  const openConnections = connections.filter((connection) => !connection.leftAt);
  const activeConnections = openConnections.filter((connection) => Date.now() - connection.lastSeenAt.getTime() <= ONLINE_WINDOW_MS);
  const connectedUsers = new Set(activeConnections.map((connection) => connection.userId));
  const knownUsers = new Set(connections.map((connection) => connection.userId));
  const now = Date.now();
  const connectionsByUser = new Map<string, typeof connections>();
  for (const connection of connections) {
    const group = connectionsByUser.get(connection.userId) ?? [];
    group.push(connection);
    connectionsByUser.set(connection.userId, group);
  }
  const rewardCountByUserId = new Map(
    rewardTotals.map((item) => [item.recipientId, item._sum.points ?? 0]),
  );
  return {
    presenceObservedAt: new Date(now).toISOString(),
    assistantPermissions: runtime.assistantPermissions as Record<string, boolean>,
    revision: runtime.revision,
    status:
      runtime.status === "live"
        ? "live"
        : runtime.status === "ended"
          ? "ended"
          : "waiting",
    classStartMode: normalizeClassStartMode(runtime.classStartMode),
    recordingStartMode: normalizeRecordingStartMode(runtime.recordingStartMode),
    startedAt: runtime.startedAt?.toISOString() ?? null,
    graceEndsAt: runtime.graceEndsAt?.toISOString() ?? null,
    stageMode: normalizeStageMode(runtime.stageMode),
    stageLocked: runtime.stageLocked,
    spotlightUserId: runtime.spotlightUserId,
    activeCoursewareId: runtime.activeCoursewareId,
    chatEnabled: runtime.chatEnabled,
    timerStartedAt: runtime.timerStartedAt?.toISOString() ?? null,
    timerDurationSec: runtime.timerDurationSec,
    timerPausedAt: runtime.timerPausedAt?.toISOString() ?? null,
    interpretation: {
      enabled: runtime.interpretationEnabled,
      provider:
        runtime.interpretationProvider === "wordly" ? "wordly" : "shengwang",
      sourceLanguage: normalizeClassroomLanguage(runtime.sourceLanguage),
      targetLanguages: normalizeTargetLanguages(
        runtime.targetLanguages,
        normalizeClassroomLanguage(runtime.sourceLanguage),
      ),
      status:
        runtime.transcriptionStatus === "starting" ||
        runtime.transcriptionStatus === "running" ||
        runtime.transcriptionStatus === "recovering" ||
        runtime.transcriptionStatus === "stopping" ||
        runtime.transcriptionStatus === "failed"
          ? runtime.transcriptionStatus
          : "stopped",
      error: runtime.transcriptionError,
    },
    composition: normalizeClassroomComposition(runtime.composition),
    members: runtime.members.map((member) => {
      const allConnections = connectionsByUser.get(member.userId) ?? [];
      const memberConnections = allConnections.filter(connection => !connection.leftAt);
      const pageHidden = member.presence === "reconnecting";
      const lastSeenAt = memberConnections.length ? new Date(Math.max(...memberConnections.map(connection => connection.lastSeenAt.getTime())))
        : pageHidden ? new Date(Math.max(member.lastSeenAt.getTime(), ...allConnections.map(connection => (connection.leftAt ?? connection.lastSeenAt).getTime())))
        : member.lastSeenAt;
      const snapshot = publicMember(member, now, rewardCountByUserId.get(member.userId) ?? 0);
      const online = runtime.status !== "ended" && (knownUsers.has(member.userId) ? connectedUsers.has(member.userId) : snapshot.online);
      return { ...snapshot,
        ...classroomConnectionPresence({ lastSeenAt, online, mayReconnect: runtime.status !== "ended" && (memberConnections.length > 0 || pageHidden || (!knownUsers.has(member.userId) && member.presence === "online")) }, now),
        rtcUids: memberConnections.map((connection) => connection.rtcUid),
        signalingUserIds: [classroomSignalingUserId(member.userId), ...memberConnections
          .map(connection => classroomSignalingUserId(connection.id.slice(sessionId.length + 1)))],
        screenUids: memberConnections.map((connection) => connection.screenUid) };
    }),
  };
}

function engagementUserIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function getClassroomEngagementSnapshot(
  sessionId: string,
): Promise<ClassroomEngagementSnapshot> {
  const [buzz, selector] = await Promise.all([
    prisma.classroomEngagementRound.findFirst({
      where: { sessionId, kind: "buzz" },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { responses: true } } },
    }),
    prisma.classroomEngagementRound.findFirst({
      where: { sessionId, kind: "selector", status: "active" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const userIds = Array.from(
    new Set(
      [buzz?.winnerUserId, selector?.winnerUserId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  const members = userIds.length
    ? await prisma.classroomMemberState.findMany({
        where: { sessionId, userId: { in: userIds } },
        select: { userId: true, displayName: true },
      })
    : [];
  const nameByUserId = new Map(
    members.map((member) => [member.userId, member.displayName || member.userId]),
  );

  return {
    activeBuzz: buzz
      ? {
          id: buzz.id,
          status: buzz.status === "active" ? "active" : "closed",
          startedAt: buzz.startedAt.toISOString(),
          winnerUserId: buzz.winnerUserId,
          winnerName: buzz.winnerUserId
            ? nameByUserId.get(buzz.winnerUserId) ?? buzz.winnerUserId
            : null,
          responseCount: buzz._count.responses,
        }
      : null,
    selector: selector
      ? {
          id: selector.id,
          selectedUserId: selector.winnerUserId,
          selectedUserName: selector.winnerUserId
            ? nameByUserId.get(selector.winnerUserId) ?? selector.winnerUserId
            : null,
          selectedUserIds: engagementUserIds(selector.resultUserIds),
          startedAt: selector.startedAt.toISOString(),
        }
      : null,
  };
}

export async function getClassroomCourseware(
  courseId: string,
  role: ClassroomRole,
  sessionId = courseId,
  refreshConversions = false,
): Promise<ClassroomCoursewareSnapshot[]> {
  const teachingRole = role === "teacher" || role === "assistant";
  const rules = await prisma.courseSessionCourseware.findMany({
    where: { sessionId },
    select: { coursewareId: true, action: true },
  });
  const excludedIds = rules
    .filter((rule) => rule.action === "exclude")
    .map((rule) => rule.coursewareId);
  const includedIds = rules
    .filter((rule) => rule.action === "include")
    .map((rule) => rule.coursewareId);
  const storedItems = await prisma.courseware.findMany({
    where: {
      courseId,
      OR: [
        { sessionId: null, id: { notIn: excludedIds } },
        { sessionId },
        ...(includedIds.length ? [{ id: { in: includedIds } }] : []),
      ],
      ...(!teachingRole ? { studentCanView: true } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  const items = refreshConversions ? await refreshCoursewareConversions(storedItems) : storedItems;
  return items.map((item) => ({
    id: item.id,
    updatedAt: item.updatedAt.toISOString(),
    name: item.name,
    ext: item.ext,
    size: item.size,
    taskUuid: item.taskUuid,
    taskStatus: item.taskStatus,
    type: item.type,
    conversion: item.conversion,
    conversionError: item.conversionError,
    studentCanView: item.studentCanView,
    studentCanDownload: item.studentCanDownload,
    whiteboardEnabled: item.whiteboardEnabled,
    downloadUrl:
      teachingRole || item.studentCanDownload
        ? `/api/courses/${courseId}/courseware/${item.id}/download?sessionId=${encodeURIComponent(sessionId)}`
        : null,
  }));
}

function normalizeStageMode(value: string): ClassroomStageMode {
  return value === "screen" ||
    value === "whiteboard" ||
    value === "spotlight"
    ? value
    : "auto";
}

function requireTeachingRole(role: ClassroomRole) {
  if (role !== "teacher" && role !== "assistant") {
    throw new ClassroomActionError("当前角色不能执行此课堂操作", 403);
  }
}

function requireLeadTeacher(role: ClassroomRole) {
  if (role !== "teacher") {
    throw new ClassroomActionError("只有主讲老师可以执行此操作", 403);
  }
}

export async function applyClassroomAction(input: {
  courseId: string;
  sessionId?: string;
  session: Pick<
    SessionPayload,
    "userId" | "displayName" | "name" | "avatar"
  >;
  role: ClassroomRole;
  clientId?: string;
  expectedRevision?: number;
  commandId?: string;
  onReplay?: () => void;
  action: ClassroomAction;
}): Promise<ClassroomRuntimeSnapshot> {
  const { courseId, session, role, action } = input;
  const sessionId = input.sessionId || courseId;
  const courseMode = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    select: {
      roomType: true,
      course: { select: { autoStudentOnStage: true } },
    },
  });
  if (!courseMode) throw new ClassroomActionError("课次不存在", 404);
  const mode = classroomModePolicy(
    courseMode.roomType,
    courseMode.course.autoStudentOnStage,
  );
  await touchClassroomMember(courseId, session, role, mode, sessionId);

  if (action.type === "startScheduledClass") {
    requireLeadTeacher(role);
    if (!input.clientId) throw new ClassroomActionError("自动开课需要有效的课堂连接", 400);
    await startScheduledClassroomIfDue(sessionId, { userId: session.userId, clientId: input.clientId });
    return getClassroomRuntimeSnapshot(courseId, sessionId, { ensure: false });
  }
  if (action.type === "heartbeat") {
    return getClassroomRuntimeSnapshot(courseId, sessionId, { ensure: false });
  }
  if (action.type === "raiseHand" && !mode.showHandRaise) {
    throw new ClassroomActionError("当前课堂模式无需举手", 409);
  }
  const engagementAction =
    action.type === "giveReward" ||
    action.type === "startBuzz" ||
    action.type === "submitBuzz" ||
    action.type === "closeBuzz" ||
    action.type === "startRandomSelector" ||
    action.type === "resetRandomSelector";
  if (engagementAction && mode.mode === "publicLive") {
    throw new ClassroomActionError("公开直播不支持该互动工具", 409);
  }

  const redisPresence = await readRedisClassroomPresence(sessionId);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const runtime = await tx.classroomRuntime.findUniqueOrThrow({
      where: { sessionId },
    });
    if (role === "assistant" && !["raiseHand", "lowerHand", "acceptStage", "declineStage", "acceptScreenShare", "declineScreenShare", "startScreenShare", "releaseScreenShare", "submitBuzz"].includes(action.type)) {
      if ((runtime.assistantPermissions as Record<string, boolean>)[session.userId] !== true) {
        throw new ClassroomActionError("主讲老师尚未授予管理权限", 403);
      }
    }
    const command = { sessionId, actorId: session.userId, clientId: input.clientId, role, commandId: input.commandId, action };
    if (await readClassroomCommand(tx, command)) { input.onReplay?.(); return; }
    if (
      classroomActionRequiresRevision(action) &&
      input.expectedRevision !== undefined &&
      input.expectedRevision !== runtime.revision
    ) {
      throw new ClassroomRevisionConflictError(runtime.revision);
    }
    if (runtime.status === "ended") {
      throw new ClassroomActionError("课堂已经结束", 409);
    }
    if (engagementAction && runtime.status !== "live") {
      throw new ClassroomActionError("开始上课后才能使用互动工具", 409);
    }

    const actorWhere = {
      sessionId_userId: { sessionId, userId: session.userId },
    } as const;
    const currentComposition = normalizeClassroomComposition(runtime.composition);
    const withoutScreenShares = (userIds: Set<string>) => currentComposition.screenShares
      ? Object.fromEntries(Object.entries(currentComposition.screenShares).filter(([, lease]) => !userIds.has(lease.userId)))
      : undefined;
    const writeComposition = async (
      nextComposition: ReturnType<typeof normalizeClassroomComposition>,
    ) => {
      await tx.classroomRuntime.update({
        where: { id: runtime.id },
        data: {
          composition: compositionJson(
            touchComposition(nextComposition, session.userId),
          ),
        },
      });
    };

    switch (action.type) {
      case "setClassStartMode": {
        requireLeadTeacher(role);
        if (action.mode !== "manual" && action.mode !== "scheduled") throw new ClassroomActionError("开课方式无效");
        if (runtime.status !== "waiting") throw new ClassroomActionError("只能在开课前调整开课方式", 409);
        await tx.classroomRuntime.update({ where: { id: runtime.id }, data: { classStartMode: action.mode } });
        break;
      }
      case "setRecordingStartMode": {
        requireLeadTeacher(role);
        if (
          action.mode !== "classStart" && action.mode !== "scheduled" &&
          action.mode !== "scheduledEarly" && action.mode !== "disabled"
        ) {
          throw new ClassroomActionError("录制启动方式无效");
        }
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          // Older clients may still submit scheduled recording modes. They no longer change class start policy.
          data: { recordingStartMode: action.mode === "disabled" ? "disabled" : "classStart" },
        });
        break;
      }
      case "setAssistantPermission": {
        requireLeadTeacher(role);
        const target = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId, userId: action.targetUserId } } });
        if (target?.role !== "assistant" || typeof action.allowed !== "boolean") throw new ClassroomActionError("无效助教权限", 400);
        await tx.classroomRuntime.update({ where: { id: runtime.id }, data: { assistantPermissions: { ...(runtime.assistantPermissions as Record<string, boolean>), [action.targetUserId]: action.allowed } } });
        if (!action.allowed && currentComposition.screenShares?.main?.userId === action.targetUserId) {
          const screenShares = { ...currentComposition.screenShares };
          delete screenShares.main;
          await writeComposition({ ...currentComposition, screenShares });
        }
        break;
      }
      case "startClass": {
        requireLeadTeacher(role);
        const lesson = await tx.courseSession.findUniqueOrThrow({
          where: { id: sessionId },
          select: { status: true, endTime: true },
        });
        if (
          lesson.status === CourseStatus.CANCELLED ||
          lesson.status === CourseStatus.FINISHED
        ) {
          throw new ClassroomActionError("已结束或取消的课次不能开始", 409);
        }
        const now = new Date();
        await tx.courseSession.update({
          where: { id: sessionId },
          data: { status: CourseStatus.LIVE, endedAt: null },
        });
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            status: "live",
            startedAt: runtime.startedAt ?? now,
            graceEndsAt: classroomGraceEndAt(lesson.endTime),
            // Every lesson records speaker captions for playback and the
            // teacher-reviewed post-class summary. Teachers may still disable
            // interpretation explicitly after the class starts.
            interpretationEnabled: true,
            targetLanguages: await captionDemandTargets(tx, sessionId, runtime.sourceLanguage, runtime.interpretationProvider === "wordly" ? "wordly" : "shengwang"),
            transcriptionStatus:
              runtime.transcriptionStatus === "running" ? "running" : "starting",
            transcriptionError: null,
            transcriptionLastCheckedAt:
              runtime.transcriptionStatus === "running"
                ? runtime.transcriptionLastCheckedAt
                : null,
            revision: { increment: 1 },
          },
        });
        if (runtime.status !== "live") await enqueueClassroomEvent(tx, sessionId, "classroom.started", "teacher_start", { userId: session.userId, role });
        return;
      }
      case "raiseHand":
        if (role !== "student") {
          throw new ClassroomActionError("教师无需举手", 409);
        }
        await tx.classroomMemberState.updateMany({
          where: { sessionId, userId: session.userId, handRaisedAt: null },
          data: { handRaisedAt: new Date() },
        });
        break;
      case "lowerHand":
        await tx.classroomMemberState.update({
          where: actorWhere,
          data: { handRaisedAt: null },
        });
        break;
      case "acceptStage": {
        if (role !== "student") {
          throw new ClassroomActionError("只有学生需要接受上台邀请", 409);
        }
        const member = await tx.classroomMemberState.findUniqueOrThrow({
          where: actorWhere,
        });
        if (member.stageState !== "invited") {
          throw new ClassroomActionError("上台邀请已失效", 409);
        }
        const stageCount = await countReservedStudentSeats(tx, sessionId, redisPresence);
        if (stageCount >= mode.maxStageStudents) {
          throw new ClassroomActionError("学生席位已满", 409);
        }
        await tx.classroomMemberState.update({
          where: actorWhere,
          data: {
            stageState: "accepted",
            onStage: true,
            microphoneAllowed: true,
            cameraAllowed: true,
            handRaisedAt: null,
          },
        });
        break;
      }
      case "declineStage":
        if (role !== "student") {
          throw new ClassroomActionError("只有学生需要处理上台邀请", 409);
        }
        await tx.classroomMemberState.update({
          where: actorWhere,
          data: { stageState: "declined", onStage: false },
        });
        break;
      case "inviteStage":
        requireTeachingRole(role);
        await tx.classroomMemberState.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          data: { stageState: "invited" },
        });
        break;
      case "removeStage":
        requireTeachingRole(role);
        await tx.classroomMemberState.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          data: {
            stageState: "removed",
            onStage: false,
            microphoneAllowed: false,
            cameraAllowed: false,
            whiteboardWritable: false,
            screenShareState: "idle",
            screenShareRequestedAt: null,
          },
        });
        await writeComposition({
          ...currentComposition,
          screenShares: withoutScreenShares(new Set([action.targetUserId])),
          seatOrder: currentComposition.seatOrder.filter(
            (userId) => userId !== action.targetUserId,
          ),
          boardItems: currentComposition.boardItems.filter(
            (item) =>
              !(
                (item.kind === "camera" || item.kind === "screen") &&
                item.sourceId === action.targetUserId
              ),
          ),
        });
        break;
      case "startScreenShare": {
        if (!input.clientId || !/^[a-zA-Z0-9-]{8,64}$/.test(input.clientId) ||
          typeof action.claimId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(action.claimId) ||
          (action.spaceId !== undefined && (typeof action.spaceId !== "string" || !action.spaceId || action.spaceId.length > 128))) {
          throw new ClassroomActionError("共享连接无效", 400);
        }
        const scope = action.spaceId || "main";
        if (action.spaceId) {
          const space = await tx.classroomSpace.findFirst({
            where: { id: action.spaceId, sessionId, status: "open" },
            include: { members: { where: { userId: session.userId, active: true }, take: 1 } },
          });
          if (!space?.members[0]?.screenShareAllowed || role === "teacher") {
            throw new ClassroomActionError("尚未获准在该教室共享屏幕", 403);
          }
        } else {
          const member = await tx.classroomMemberState.findUnique({ where: actorWhere });
          if (!canShareClassroomScreen({ role, member, studentSharingSupported: mode.studentCanShareWhenOnStage,
            assistantManagementAllowed: (runtime.assistantPermissions as Record<string, boolean>)[session.userId] === true })) {
            throw new ClassroomActionError("老师尚未授予屏幕共享权限", 403);
          }
        }
        const previous = currentComposition.screenShares?.[scope];
        if (previous && !ownsScreenShare(previous, session.userId, input.clientId) &&
          !(role === "teacher" && scope === "main")) {
          throw new ClassroomActionError("已有成员正在共享屏幕，请先停止当前共享", 409);
        }
        if (previous && previous.userId !== session.userId && scope === "main") {
          await tx.classroomMemberState.updateMany({ where: { sessionId, userId: previous.userId, role: "student" },
            data: { screenShareState: "idle", screenShareRequestedAt: null } });
        }
        const next = { ...currentComposition, screenShares: { ...currentComposition.screenShares,
          [scope]: { userId: session.userId, clientId: input.clientId,
            rtcUid: classroomRtcUid(`${session.userId}:${input.clientId}`, "screen"), claimId: action.claimId } } };
        await writeComposition(scope === "main" ? placeClassroomBoardItem({ ...next,
          boardItems: next.boardItems.filter(item => item.kind !== "screen" || item.sourceId === session.userId),
        }, { id: `screen:${session.userId}`, kind: "screen", sourceId: session.userId,
          rect: defaultBoardRect("screen"), locked: false, visible: true }) : next);
        if (scope === "main") await tx.classroomRuntime.update({ where: { id: runtime.id }, data: { stageMode: "screen", stageLocked: false } });
        break;
      }
      case "releaseScreenShare": {
        const scope = action.spaceId || "main";
        const lease = currentComposition.screenShares?.[scope];
        // A delayed teardown must never remove a replacement publisher.
        if (!input.clientId || !ownsScreenShare(lease, session.userId, input.clientId) || lease?.claimId !== action.claimId) return;
        const screenShares = { ...currentComposition.screenShares };
        delete screenShares[scope];
        await writeComposition({ ...currentComposition, screenShares,
          boardItems: scope === "main" ? currentComposition.boardItems.filter(item => !(item.kind === "screen" && item.sourceId === session.userId)) : currentComposition.boardItems });
        // Releasing a capture (including a failed join) does not revoke the
        // teacher's grant. Explicit stop/revoke actions still remove it.
        break;
      }
      case "requestScreenShare": {
        requireTeachingRole(role);
        if (!mode.studentCanShareWhenOnStage) {
          throw new ClassroomActionError("当前课堂模式不支持学生屏幕共享", 409);
        }
        const target = await tx.classroomMemberState.findUnique({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          select: { role: true },
        });
        if (!target || target.role !== "student") {
          throw new ClassroomActionError("只能向当前课堂的学生发起共享请求", 409);
        }
        await tx.classroomMemberState.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          data: {
            screenShareState: screenShareStateAfter("idle", "request"),
            screenShareRequestedAt: new Date(),
          },
        });
        break;
      }
      case "acceptScreenShare": {
        if (role !== "student") {
          throw new ClassroomActionError("只有学生需要处理共享请求", 409);
        }
        const member = await tx.classroomMemberState.findUniqueOrThrow({
          where: actorWhere,
        });
        if (member.screenShareState !== "requested") {
          throw new ClassroomActionError("屏幕共享请求已失效", 409);
        }
        if (
          !member.screenShareRequestedAt ||
          Date.now() - member.screenShareRequestedAt.getTime() >
            SCREEN_SHARE_REQUEST_TTL_MS
        ) {
          throw new ClassroomActionError("屏幕共享请求已超时，请老师重新发起", 409);
        }
        if (!member.onStage) {
          const stageCount = await countReservedStudentSeats(tx, sessionId, redisPresence);
          if (stageCount >= mode.maxStageStudents) {
            throw new ClassroomActionError("学生席位已满，暂时无法共享屏幕", 409);
          }
        }
        await tx.classroomMemberState.update({
          where: actorWhere,
          data: {
            screenShareState: screenShareStateAfter("requested", "accept"),
            stageState: "accepted",
            onStage: true,
            handRaisedAt: null,
          },
        });
        await writeComposition(
          placeClassroomBoardItem(currentComposition, {
            id: `screen:${session.userId}`,
            kind: "screen",
            sourceId: session.userId,
            rect: defaultBoardRect("screen"),
            locked: false,
            visible: true,
          }),
        );
        break;
      }
      case "declineScreenShare": {
        if (role !== "student") {
          throw new ClassroomActionError("只有学生需要处理共享请求", 409);
        }
        const member = await tx.classroomMemberState.findUniqueOrThrow({
          where: actorWhere,
          select: { screenShareState: true },
        });
        await tx.classroomMemberState.update({
          where: actorWhere,
          data: {
            screenShareState: screenShareStateAfter(
              member.screenShareState === "requested" ||
                  member.screenShareState === "accepted" ||
                  member.screenShareState === "declined"
                ? member.screenShareState
                : "idle",
              "decline",
            ),
            screenShareRequestedAt: null,
          },
        });
        await writeComposition({
          ...currentComposition,
          screenShares: withoutScreenShares(new Set([session.userId])),
          boardItems: currentComposition.boardItems.filter(
            (item) => !(item.kind === "screen" && item.sourceId === session.userId),
          ),
        });
        break;
      }
      case "stopScreenShare": {
        requireTeachingRole(role);
        const target = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId, userId: action.targetUserId } } });
        if (target?.role === "teacher" && role !== "teacher") throw new ClassroomActionError("只有主持人可以停止主持人的共享", 403);
        await tx.classroomMemberState.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          data: {
            screenShareState: screenShareStateAfter("accepted", "stop"),
            screenShareRequestedAt: null,
          },
        });
        await writeComposition({
          ...currentComposition,
          screenShares: withoutScreenShares(new Set([action.targetUserId])),
          boardItems: currentComposition.boardItems.filter(
            (item) => !(item.kind === "screen" && item.sourceId === action.targetUserId),
          ),
        });
        break;
      }
      case "setMemberMuted":
        requireTeachingRole(role);
        await tx.classroomMemberState.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          data: { chatMuted: action.muted },
        });
        break;
      case "setMediaAllowed":
        requireTeachingRole(role);
        await tx.classroomMemberState.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          data: {
            microphoneAllowed: action.microphoneAllowed,
            cameraAllowed: action.cameraAllowed,
          },
        });
        break;
      case "muteAll":
        requireTeachingRole(role);
        await tx.classroomMemberState.updateMany({
          where: { sessionId, role: "student" },
          data: { chatMuted: action.muted },
        });
        break;
      case "setWhiteboardWritable":
        requireTeachingRole(role);
        if (action.writable) {
          const targetMember = await tx.classroomMemberState.findUnique({
            where: {
              sessionId_userId: {
                sessionId,
                userId: action.targetUserId,
              },
            },
            select: { role: true, onStage: true, stageState: true },
          });
          if (
            !targetMember ||
            targetMember.role !== "student"
          ) {
            throw new ClassroomActionError(
              "请选择课堂中的学生",
              409,
            );
          }
        }
        await tx.classroomMemberState.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          data: { whiteboardWritable: action.writable },
        });
        break;
      case "setSpotlight":
        requireTeachingRole(role);
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            spotlightUserId: action.targetUserId,
            stageMode: action.targetUserId ? "spotlight" : "auto",
          },
        });
        break;
      case "reorderSeats": {
        requireTeachingRole(role);
        const seatMembers = await tx.classroomMemberState.findMany({
          where: {
            sessionId,
            OR: [{ role: { not: "student" } }, { onStage: true }],
          },
          select: { userId: true },
          orderBy: { joinedAt: "asc" },
        });
        await writeComposition({
          ...currentComposition,
          seatOrder: orderClassroomSeats(
            action.seatOrder,
            seatMembers.map((member) => member.userId),
          ),
        });
        break;
      }
      case "placeBoardItem": {
        requireTeachingRole(role);
        if (
          !action.item ||
          typeof action.item.id !== "string" ||
          typeof action.item.sourceId !== "string" ||
          !["camera", "screen", "courseware"].includes(action.item.kind)
        ) {
          throw new ClassroomActionError("课堂编排对象无效");
        }
        const sourceExists = action.item.kind === "courseware"
          ? Boolean(await tx.courseware.findFirst({
              where: {
                id: action.item.sourceId,
                courseId,
                OR: [{ sessionId }, { sessionId: null }],
              },
              select: { id: true },
            }))
          : Boolean(await tx.classroomMemberState.findUnique({
              where: {
                sessionId_userId: {
                  sessionId,
                  userId: action.item.sourceId,
                },
              },
              select: { id: true },
            }));
        if (!sourceExists) {
          throw new ClassroomActionError("课堂编排对象不存在", 404);
        }
        await writeComposition(
          placeClassroomBoardItem(currentComposition, action.item),
        );
        break;
      }
      case "updateBoardItem": {
        requireTeachingRole(role);
        await writeComposition(
          updateClassroomBoardItem(currentComposition, action.itemId, {
            rect: action.rect,
            locked: action.locked,
            visible: action.visible,
            shape: action.shape,
          }),
        );
        break;
      }
      case "removeBoardItem":
        requireTeachingRole(role);
        await writeComposition({
          ...currentComposition,
          boardItems: currentComposition.boardItems.filter(
            (item) => item.id !== action.itemId,
          ),
        });
        break;
      case "bringBoardItemToFront":
        requireTeachingRole(role);
        await writeComposition(
          bringClassroomBoardItemToFront(currentComposition, action.itemId),
        );
        break;
      case "resetComposition":
        requireTeachingRole(role);
        await writeComposition({ ...emptyClassroomComposition(), screenShares: currentComposition.screenShares });
        break;
      case "arrangeVideoGallery": {
        requireTeachingRole(role);
        const onlineFilter = await classroomOnlineMemberFilter(tx, sessionId, redisPresence);
        const galleryMembers = await tx.classroomMemberState.findMany({
          where: {
            sessionId,
            AND: [onlineFilter, { OR: [{ role: { not: "student" } }, { onStage: true }] }],
          },
          select: { userId: true, role: true },
          orderBy: { joinedAt: "asc" },
          take: 12,
        });
        if (galleryMembers.length === 0) {
          throw new ClassroomActionError("当前没有可编排的视频席位", 409);
        }
        await writeComposition(arrangeClassroomVideoGallery(currentComposition, galleryMembers.map(member => ({ ...member, role: member.role as ClassroomRole }))));
        break;
      }
      case "swapSeats": {
        requireTeachingRole(role);
        const seatMembers = await tx.classroomMemberState.findMany({
          where: {
            sessionId,
            OR: [{ role: { not: "student" } }, { onStage: true }],
          },
          select: { userId: true },
          orderBy: { joinedAt: "asc" },
        });
        const seatOrder = orderClassroomSeats(
          currentComposition.seatOrder,
          seatMembers.map((member) => member.userId),
        );
        const firstIndex = seatOrder.indexOf(action.firstUserId);
        const secondIndex = seatOrder.indexOf(action.secondUserId);
        if (firstIndex < 0 || secondIndex < 0) {
          throw new ClassroomActionError("交换席位的成员不在台上", 409);
        }
        [seatOrder[firstIndex], seatOrder[secondIndex]] = [
          seatOrder[secondIndex],
          seatOrder[firstIndex],
        ];
        await writeComposition({ ...currentComposition, seatOrder });
        break;
      }
      case "authorizeAllOnStage":
        requireTeachingRole(role);
        await tx.classroomMemberState.updateMany({
          where: {
            sessionId,
            role: "student",
            onStage: true,
            stageState: "accepted",
          },
          data: { whiteboardWritable: true },
        });
        break;
      case "deauthorizeAll":
        requireTeachingRole(role);
        await tx.classroomMemberState.updateMany({
          where: { sessionId, role: "student" },
          data: { whiteboardWritable: false },
        });
        break;
      case "removeAllStudentsFromStage": {
        requireTeachingRole(role);
        const students = await tx.classroomMemberState.findMany({
          where: { sessionId, role: "student" },
          select: { userId: true },
        });
        const studentIds = new Set(students.map((student) => student.userId));
        await tx.classroomMemberState.updateMany({
          where: { sessionId, role: "student" },
          data: {
            stageState: "removed",
            onStage: false,
            microphoneAllowed: false,
            cameraAllowed: false,
            whiteboardWritable: false,
            screenShareState: "idle",
            screenShareRequestedAt: null,
          },
        });
        await writeComposition({
          ...currentComposition,
          screenShares: withoutScreenShares(studentIds),
          seatOrder: currentComposition.seatOrder.filter(
            (userId) => !studentIds.has(userId),
          ),
          boardItems: currentComposition.boardItems.filter(
            (item) =>
              !(
                (item.kind === "camera" || item.kind === "screen") &&
                studentIds.has(item.sourceId)
              ),
          ),
        });
        break;
      }
      case "muteAllMicrophones":
      case "unmuteAllMicrophones":
        requireTeachingRole(role);
        await tx.classroomMemberState.updateMany({
          where: { sessionId, role: "student" },
          data: { microphoneAllowed: action.type === "unmuteAllMicrophones" },
        });
        break;
      case "setStage":
        requireTeachingRole(role);
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            stageMode: action.mode,
            stageLocked: action.locked,
            activeCoursewareId: action.coursewareId,
          },
        });
        break;
      case "setChatEnabled":
        requireTeachingRole(role);
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: { chatEnabled: action.enabled },
        });
        break;
      case "setInterpretation": {
        requireLeadTeacher(role);
        const provider = action.provider === "wordly" ? "wordly" : "shengwang";
        const sourceLanguage = normalizeClassroomLanguage(action.sourceLanguage);
        if (!supportsCaptionTranslation(provider, action.sourceLanguage) || !supportsCaptionTranslation("shengwang", action.sourceLanguage)) throw new ClassroomActionError("当前翻译服务不支持此课堂语言");
        // Output languages belong to active participants, including older clients
        // that still submit a manually configured targetLanguages array.
        const targetLanguages = await captionDemandTargets(tx, sessionId, sourceLanguage, provider);
        if (targetLanguages.length > captionTranslationLimit(provider)) throw new ClassroomActionError("当前课堂使用的翻译语言超出服务上限", 409);
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            interpretationEnabled: action.enabled,
            interpretationProvider: provider,
            sourceLanguage,
            targetLanguages,
            transcriptionStatus: action.enabled ? "starting" : "stopped",
            transcriptionError: null,
            // A timestamp on an explicit disable distinguishes the teacher's
            // choice from an untouched legacy runtime that should auto-start
            // captions when the teacher enters the live room.
            transcriptionLastCheckedAt: action.enabled ? null : new Date(),
          },
        });
        break;
      }
      case "startTimer":
        requireTeachingRole(role);
        if (
          !Number.isInteger(action.durationSec) ||
          action.durationSec < 10 ||
          action.durationSec > 24 * 60 * 60
        ) {
          throw new ClassroomActionError("计时器时长无效");
        }
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            timerStartedAt: new Date(),
            timerDurationSec: action.durationSec,
            timerPausedAt: null,
          },
        });
        break;
      case "pauseTimer": {
        requireTeachingRole(role);
        if (!runtime.timerStartedAt || !runtime.timerDurationSec) {
          throw new ClassroomActionError("当前没有可暂停的计时器");
        }
        if (runtime.timerPausedAt) break;
        const elapsedSeconds = Math.max(
          0,
          Math.floor((Date.now() - runtime.timerStartedAt.getTime()) / 1000),
        );
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            timerDurationSec: Math.max(0, runtime.timerDurationSec - elapsedSeconds),
            timerPausedAt: new Date(),
          },
        });
        break;
      }
      case "resumeTimer":
        requireTeachingRole(role);
        if (!runtime.timerStartedAt || !runtime.timerDurationSec) {
          throw new ClassroomActionError("当前没有可继续的计时器");
        }
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: { timerStartedAt: new Date(), timerPausedAt: null },
        });
        break;
      case "resetTimer":
        requireTeachingRole(role);
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            timerStartedAt: null,
            timerDurationSec: null,
            timerPausedAt: null,
          },
        });
        break;
      case "giveReward": {
        requireTeachingRole(role);
        const requestedTargetUserIds = Array.isArray(action.targetUserIds)
          ? action.targetUserIds
          : [];
        const targetUserIds = Array.from(
          new Set(
            requestedTargetUserIds.filter(
              (userId): userId is string =>
                typeof userId === "string" && Boolean(userId.trim()),
            ),
          ),
        ).slice(0, mode.maxStageStudents + 1);
        if (targetUserIds.length === 0) {
          throw new ClassroomActionError("请选择要奖励的学生");
        }
        const targets = await tx.classroomMemberState.findMany({
          where: { sessionId, userId: { in: targetUserIds }, role: "student" },
          select: { userId: true },
        });
        if (targets.length !== targetUserIds.length) {
          throw new ClassroomActionError("奖励对象已不在当前课堂", 409);
        }
        await tx.classroomRewardEvent.createMany({
          data: targets.map((target) => ({
            runtimeId: runtime.id,
            courseId,
            sessionId,
            giverId: session.userId,
            recipientId: target.userId,
            points: 1,
          })),
        });
        break;
      }
      case "startBuzz":
        requireTeachingRole(role);
        await tx.classroomEngagementRound.updateMany({
          where: { sessionId, kind: "buzz", status: "active" },
          data: { status: "closed", endedAt: new Date() },
        });
        await tx.classroomEngagementRound.create({
          data: {
            runtimeId: runtime.id,
            courseId,
            sessionId,
            kind: "buzz",
            startedById: session.userId,
          },
        });
        break;
      case "submitBuzz": {
        if (role !== "student") {
          throw new ClassroomActionError("只有学生可以参与抢答", 409);
        }
        const round = await tx.classroomEngagementRound.findFirst({
          where: { sessionId, kind: "buzz", status: "active" },
          orderBy: { createdAt: "desc" },
        });
        if (!round) {
          throw new ClassroomActionError("当前没有进行中的抢答", 409);
        }
        const existing = await tx.classroomEngagementResponse.findUnique({
          where: { roundId_userId: { roundId: round.id, userId: session.userId } },
        });
        if (existing) break;
        const claimed = await tx.classroomEngagementRound.updateMany({
          where: { id: round.id, status: "active", winnerUserId: null },
          data: {
            winnerUserId: session.userId,
            status: "closed",
            endedAt: new Date(),
          },
        });
        await tx.classroomEngagementResponse.createMany({
          data: [{
            roundId: round.id,
            sessionId,
            userId: session.userId,
            isWinner: claimed.count === 1,
          }],
          skipDuplicates: true,
        });
        break;
      }
      case "closeBuzz":
        requireTeachingRole(role);
        await tx.classroomEngagementRound.updateMany({
          where: { sessionId, kind: "buzz", status: "active" },
          data: { status: "closed", endedAt: new Date() },
        });
        break;
      case "startRandomSelector": {
        requireTeachingRole(role);
        const onlineFilter = await classroomOnlineMemberFilter(tx, sessionId, redisPresence);
        const candidates = await tx.classroomMemberState.findMany({
          where: {
            sessionId,
            role: "student",
            ...onlineFilter,
          },
          select: { userId: true },
          orderBy: { joinedAt: "asc" },
        });
        if (candidates.length === 0) {
          throw new ClassroomActionError("当前没有在线学生可供点名", 409);
        }
        let selector = await tx.classroomEngagementRound.findFirst({
          where: { sessionId, kind: "selector", status: "active" },
          orderBy: { createdAt: "desc" },
        });
        const previousSelectedIds = selector
          ? engagementUserIds(selector.resultUserIds)
          : [];
        const cycle = classroomSelectorCycle(
          candidates.map((candidate) => candidate.userId),
          previousSelectedIds,
        );
        if (cycle.restarted && selector) {
          await tx.classroomEngagementRound.update({
            where: { id: selector.id },
            data: { status: "closed", endedAt: new Date() },
          });
          selector = null;
        }
        const selectedUserId =
          cycle.availableUserIds[randomInt(cycle.availableUserIds.length)];
        if (!selectedUserId) {
          throw new ClassroomActionError("随机点名失败，请重试", 409);
        }
        if (selector) {
          await tx.classroomEngagementRound.update({
            where: { id: selector.id },
            data: {
              winnerUserId: selectedUserId,
              resultUserIds: [...cycle.selectedUserIds, selectedUserId],
            },
          });
        } else {
          await tx.classroomEngagementRound.create({
            data: {
              runtimeId: runtime.id,
              courseId,
              sessionId,
              kind: "selector",
              startedById: session.userId,
              winnerUserId: selectedUserId,
              resultUserIds: [selectedUserId],
            },
          });
        }
        break;
      }
      case "resetRandomSelector":
        requireTeachingRole(role);
        await tx.classroomEngagementRound.updateMany({
          where: { sessionId, kind: "selector", status: "active" },
          data: { status: "closed", endedAt: new Date() },
        });
        break;
    }

    await tx.classroomRuntime.update({
      where: { id: runtime.id },
      data: { revision: { increment: 1 } },
    });
    await saveClassroomCommand(tx, command);
  });

  return getClassroomRuntimeSnapshot(courseId, sessionId, { ensure: false });
}
