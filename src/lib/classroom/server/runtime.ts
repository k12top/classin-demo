import "server-only";

import { randomInt } from "node:crypto";

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
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";
import {
  normalizeClassroomLanguage,
  normalizeTargetLanguages,
} from "@/lib/classroom/languages";
import { classroomSelectorCycle } from "@/lib/classroom/engagement";

const ONLINE_WINDOW_MS = 45_000;

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
    select: { id: true, status: true, endTime: true },
  });
  if (!lesson) throw new ClassroomActionError("课次不存在", 404);

  const ended =
    lesson.status === CourseStatus.FINISHED ||
    lesson.status === CourseStatus.CANCELLED;
  const live =
    lesson.status === CourseStatus.LIVE ||
    lesson.status === CourseStatus.AFTER_CLASS;
  const runtime = await prisma.classroomRuntime.upsert({
    where: { sessionId },
    create: {
      courseId,
      sessionId,
      status: ended ? "ended" : live ? "live" : "waiting",
      graceEndsAt: classroomGraceEndAt(lesson.endTime),
      startedAt: live ? new Date() : null,
    },
    update: {
      graceEndsAt: classroomGraceEndAt(lesson.endTime),
      ...(ended ? { status: "ended" } : {}),
    },
  });

  if (
    runtime.status !== "ended" &&
    runtime.graceEndsAt &&
    runtime.graceEndsAt.getTime() <= Date.now()
  ) {
    const [, updated] = await prisma.$transaction([
      prisma.courseSession.update({
        where: { id: sessionId },
        data: { status: CourseStatus.FINISHED },
      }),
      prisma.classroomRuntime.update({
        where: { id: runtime.id },
        data: { status: "ended", revision: { increment: 1 } },
      }),
    ]);
    return updated;
  }
  return runtime;
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
) {
  const [runtime, course] = await Promise.all([
    ensureClassroomRuntime(courseId, sessionId),
    suppliedModePolicy
      ? Promise.resolve(null)
      : prisma.courseSession.findUnique({
          where: { id: sessionId },
          select: { roomType: true },
        }),
  ]);
  const mode =
    suppliedModePolicy ?? classroomModePolicy(course?.roomType ?? 4);
  const teachingRole = role === "teacher" || role === "assistant";
  const assistantStartsOnStage =
    role === "assistant" && mode.mode !== "largeClass";
  const studentStartsOnStage =
    role === "student" && mode.defaultStudentOnStage;
  const startsOnStage =
    role === "teacher" || assistantStartsOnStage || studentStartsOnStage;
  return prisma.classroomMemberState.upsert({
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
      stageState: startsOnStage ? "accepted" : "offstage",
      microphoneAllowed: startsOnStage,
      cameraAllowed: startsOnStage,
      whiteboardWritable:
        teachingRole || mode.defaultStudentWhiteboardWritable,
    },
    update: {
      runtimeId: runtime.id,
      displayName: session.displayName || session.name || session.userId,
      avatar: session.avatar || "",
      role,
      presence: "online",
      lastSeenAt: new Date(),
      ...(startsOnStage
        ? {
            onStage: true,
            stageState: "accepted",
            microphoneAllowed: true,
            cameraAllowed: true,
            whiteboardWritable:
              teachingRole || mode.defaultStudentWhiteboardWritable,
          }
        : {}),
    },
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
  const screenShareState =
    member.screenShareState === "requested" ||
    member.screenShareState === "accepted"
      ? member.screenShareState
      : "idle";
  return {
    userId: member.userId,
    displayName: member.displayName || member.userId,
    avatar: member.avatar,
    role,
    online:
      member.presence === "online" &&
      now - member.lastSeenAt.getTime() <= ONLINE_WINDOW_MS,
    onStage: member.onStage,
    stageState,
    screenShareState,
    screenShareRequestedAt:
      member.screenShareRequestedAt?.toISOString() ?? null,
    microphoneAllowed: member.microphoneAllowed,
    cameraAllowed: member.cameraAllowed,
    chatMuted: member.chatMuted,
    whiteboardWritable: member.whiteboardWritable,
    handRaisedAt: member.handRaisedAt?.toISOString() ?? null,
    rewardCount,
  };
}

export async function getClassroomRuntimeSnapshot(
  courseId: string,
  sessionId = courseId,
  options: { ensure?: boolean } = {},
): Promise<ClassroomRuntimeSnapshot> {
  if (options.ensure !== false) {
    await ensureClassroomRuntime(courseId, sessionId);
  }
  const [runtime, rewardTotals] = await Promise.all([
    prisma.classroomRuntime.findUniqueOrThrow({
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
    }),
    prisma.classroomRewardEvent.groupBy({
      by: ["recipientId"],
      where: { sessionId },
      _sum: { points: true },
    }),
  ]);
  const rewardCountByUserId = new Map(
    rewardTotals.map((item) => [item.recipientId, item._sum.points ?? 0]),
  );
  return {
    revision: runtime.revision,
    status:
      runtime.status === "live"
        ? "live"
        : runtime.status === "ended"
          ? "ended"
          : "waiting",
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
    members: runtime.members.map((member) =>
      publicMember(member, Date.now(), rewardCountByUserId.get(member.userId) ?? 0),
    ),
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
  const items = await prisma.courseware.findMany({
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
  return items.map((item) => ({
    id: item.id,
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
  expectedRevision?: number;
  action: ClassroomAction;
}): Promise<ClassroomRuntimeSnapshot> {
  const { courseId, session, role, action } = input;
  const sessionId = input.sessionId || courseId;
  const courseMode = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId },
    select: { roomType: true },
  });
  if (!courseMode) throw new ClassroomActionError("课次不存在", 404);
  const mode = classroomModePolicy(courseMode.roomType);
  await touchClassroomMember(courseId, session, role, mode, sessionId);

  if (action.type === "heartbeat") {
    return getClassroomRuntimeSnapshot(courseId, sessionId);
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

  await prisma.$transaction(async (tx) => {
    const runtime = await tx.classroomRuntime.findUniqueOrThrow({
      where: { sessionId },
    });
    if (
      action.type !== "submitBuzz" &&
      input.expectedRevision !== undefined &&
      input.expectedRevision !== runtime.revision
    ) {
      throw new ClassroomRevisionConflictError(runtime.revision);
    }
    if (engagementAction && runtime.status !== "live") {
      throw new ClassroomActionError("开始上课后才能使用互动工具", 409);
    }

    const actorWhere = {
      sessionId_userId: { sessionId, userId: session.userId },
    } as const;

    switch (action.type) {
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
            revision: { increment: 1 },
          },
        });
        return;
      }
      case "raiseHand":
        if (role !== "student") {
          throw new ClassroomActionError("教师无需举手", 409);
        }
        await tx.classroomMemberState.update({
          where: actorWhere,
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
        const stageCount = await tx.classroomMemberState.count({
          where: { sessionId, role: "student", onStage: true },
        });
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
          data: { stageState: "offstage", onStage: false },
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
            stageState: "offstage",
            onStage: false,
            microphoneAllowed: false,
            cameraAllowed: false,
            whiteboardWritable: false,
            screenShareState: "idle",
            screenShareRequestedAt: null,
          },
        });
        break;
      case "requestScreenShare": {
        requireTeachingRole(role);
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
            screenShareState: "requested",
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
        if (!member.onStage) {
          const stageCount = await tx.classroomMemberState.count({
            where: { sessionId, role: "student", onStage: true },
          });
          if (stageCount >= mode.maxStageStudents) {
            throw new ClassroomActionError("学生席位已满，暂时无法共享屏幕", 409);
          }
        }
        await tx.classroomMemberState.update({
          where: actorWhere,
          data: {
            screenShareState: "accepted",
            stageState: "accepted",
            onStage: true,
            handRaisedAt: null,
          },
        });
        break;
      }
      case "declineScreenShare":
        if (role !== "student") {
          throw new ClassroomActionError("只有学生需要处理共享请求", 409);
        }
        await tx.classroomMemberState.update({
          where: actorWhere,
          data: {
            screenShareState: "idle",
            screenShareRequestedAt: null,
          },
        });
        break;
      case "stopScreenShare":
        requireTeachingRole(role);
        await tx.classroomMemberState.update({
          where: {
            sessionId_userId: {
              sessionId,
              userId: action.targetUserId,
            },
          },
          data: {
            screenShareState: "idle",
            screenShareRequestedAt: null,
          },
        });
        break;
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
            targetMember.role !== "student" ||
            !targetMember.onStage ||
            targetMember.stageState !== "accepted"
          ) {
            throw new ClassroomActionError(
              "学生接受上台邀请后才能获得标注权限",
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
        const targetLanguages = normalizeTargetLanguages(
          action.targetLanguages,
          sourceLanguage,
          provider === "shengwang" ? 10 : 20,
        );
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            interpretationEnabled: action.enabled,
            interpretationProvider: provider,
            sourceLanguage,
            targetLanguages,
            transcriptionStatus: action.enabled ? "starting" : "stopped",
            transcriptionError: null,
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
        const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
        const candidates = await tx.classroomMemberState.findMany({
          where: {
            sessionId,
            role: "student",
            presence: "online",
            lastSeenAt: { gte: onlineSince },
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
  });

  return getClassroomRuntimeSnapshot(courseId, sessionId);
}
