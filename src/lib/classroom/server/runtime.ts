import "server-only";

import type {
  ClassroomAction,
  ClassroomCoursewareSnapshot,
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

export async function ensureClassroomRuntime(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, status: true, endTime: true },
  });
  if (!course) throw new ClassroomActionError("课程不存在", 404);

  const ended =
    course.status === CourseStatus.FINISHED ||
    course.status === CourseStatus.CANCELLED;
  const live =
    course.status === CourseStatus.LIVE ||
    course.status === CourseStatus.AFTER_CLASS;
  const runtime = await prisma.classroomRuntime.upsert({
    where: { courseId },
    create: {
      courseId,
      status: ended ? "ended" : live ? "live" : "waiting",
      graceEndsAt: classroomGraceEndAt(course.endTime),
      startedAt: live ? new Date() : null,
    },
    update: {
      graceEndsAt: classroomGraceEndAt(course.endTime),
      ...(ended ? { status: "ended" } : {}),
    },
  });

  if (
    runtime.status !== "ended" &&
    runtime.graceEndsAt &&
    runtime.graceEndsAt.getTime() <= Date.now()
  ) {
    const [, updated] = await prisma.$transaction([
      prisma.course.update({
        where: { id: courseId },
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
) {
  const [runtime, course] = await Promise.all([
    ensureClassroomRuntime(courseId),
    suppliedModePolicy
      ? Promise.resolve(null)
      : prisma.course.findUnique({
          where: { id: courseId },
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
    where: { courseId_userId: { courseId, userId: session.userId } },
    create: {
      runtimeId: runtime.id,
      courseId,
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
    microphoneAllowed: boolean;
    cameraAllowed: boolean;
    chatMuted: boolean;
    whiteboardWritable: boolean;
    handRaisedAt: Date | null;
    lastSeenAt: Date;
  },
  now = Date.now(),
): ClassroomMemberSnapshot {
  const role: ClassroomRole =
    member.role === "teacher" || member.role === "assistant"
      ? member.role
      : "student";
  const stageState =
    member.stageState === "invited" || member.stageState === "accepted"
      ? member.stageState
      : "offstage";
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
    microphoneAllowed: member.microphoneAllowed,
    cameraAllowed: member.cameraAllowed,
    chatMuted: member.chatMuted,
    whiteboardWritable: member.whiteboardWritable,
    handRaisedAt: member.handRaisedAt?.toISOString() ?? null,
  };
}

export async function getClassroomRuntimeSnapshot(
  courseId: string,
): Promise<ClassroomRuntimeSnapshot> {
  await ensureClassroomRuntime(courseId);
  const runtime = await prisma.classroomRuntime.findUniqueOrThrow({
    where: { courseId },
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
        runtime.transcriptionStatus === "failed"
          ? runtime.transcriptionStatus
          : "stopped",
      error: runtime.transcriptionError,
    },
    members: runtime.members.map((member) => publicMember(member)),
  };
}

export async function getClassroomCourseware(
  courseId: string,
  role: ClassroomRole,
): Promise<ClassroomCoursewareSnapshot[]> {
  const teachingRole = role === "teacher" || role === "assistant";
  const items = await prisma.courseware.findMany({
    where: {
      courseId,
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
        ? `/api/courses/${courseId}/courseware/${item.id}/download`
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
  session: Pick<
    SessionPayload,
    "userId" | "displayName" | "name" | "avatar"
  >;
  role: ClassroomRole;
  expectedRevision?: number;
  action: ClassroomAction;
}): Promise<ClassroomRuntimeSnapshot> {
  const { courseId, session, role, action } = input;
  const courseMode = await prisma.course.findUnique({
    where: { id: courseId },
    select: { roomType: true },
  });
  if (!courseMode) throw new ClassroomActionError("课程不存在", 404);
  const mode = classroomModePolicy(courseMode.roomType);
  await touchClassroomMember(courseId, session, role, mode);

  if (action.type === "heartbeat") {
    return getClassroomRuntimeSnapshot(courseId);
  }
  if (action.type === "raiseHand" && !mode.showHandRaise) {
    throw new ClassroomActionError("当前课堂模式无需举手", 409);
  }

  await prisma.$transaction(async (tx) => {
    const runtime = await tx.classroomRuntime.findUniqueOrThrow({
      where: { courseId },
    });
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== runtime.revision
    ) {
      throw new ClassroomRevisionConflictError(runtime.revision);
    }

    const actorWhere = {
      courseId_userId: { courseId, userId: session.userId },
    } as const;

    switch (action.type) {
      case "startClass": {
        requireLeadTeacher(role);
        const course = await tx.course.findUniqueOrThrow({
          where: { id: courseId },
          select: { status: true, endTime: true },
        });
        if (
          course.status === CourseStatus.CANCELLED ||
          course.status === CourseStatus.FINISHED
        ) {
          throw new ClassroomActionError("已结束或取消的课程不能开始", 409);
        }
        const now = new Date();
        await tx.course.update({
          where: { id: courseId },
          data: { status: CourseStatus.LIVE, endedAt: null },
        });
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: {
            status: "live",
            startedAt: runtime.startedAt ?? now,
            graceEndsAt: classroomGraceEndAt(course.endTime),
            revision: { increment: 1 },
          },
        });
        return;
      }
      case "endClass":
        requireLeadTeacher(role);
        await tx.course.update({
          where: { id: courseId },
          data: { status: CourseStatus.AFTER_CLASS, endedAt: new Date() },
        });
        await tx.classroomRuntime.update({
          where: { id: runtime.id },
          data: { status: "ended", revision: { increment: 1 } },
        });
        return;
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
          where: { courseId, role: "student", onStage: true },
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
            courseId_userId: {
              courseId,
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
            courseId_userId: {
              courseId,
              userId: action.targetUserId,
            },
          },
          data: {
            stageState: "offstage",
            onStage: false,
            microphoneAllowed: false,
            cameraAllowed: false,
            whiteboardWritable: false,
          },
        });
        break;
      case "setMemberMuted":
        requireTeachingRole(role);
        await tx.classroomMemberState.update({
          where: {
            courseId_userId: {
              courseId,
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
            courseId_userId: {
              courseId,
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
          where: { courseId, role: "student" },
          data: { chatMuted: action.muted },
        });
        break;
      case "setWhiteboardWritable":
        requireTeachingRole(role);
        if (action.writable) {
          const targetMember = await tx.classroomMemberState.findUnique({
            where: {
              courseId_userId: {
                courseId,
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
            courseId_userId: {
              courseId,
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
    }

    await tx.classroomRuntime.update({
      where: { id: runtime.id },
      data: { revision: { increment: 1 } },
    });
  });

  return getClassroomRuntimeSnapshot(courseId);
}
