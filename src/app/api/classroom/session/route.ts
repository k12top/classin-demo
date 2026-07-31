import { NextRequest, NextResponse } from "next/server";
import { classroomMediaProfile } from "@/lib/classroom/config";
import type {
  ClassroomMessageSnapshot,
  ClassroomRole,
} from "@/lib/classroom/types";
import { ClassroomProviderConfigurationError } from "@/lib/classroom/server/errors";
import {
  getClassroomServerProvider,
  getRecordingProvider,
} from "@/lib/classroom/server/provider-factory";
import { closeOpenAttendanceSessionsForLesson } from "@/lib/course-attendance";
import { resolveCourseSessionAccess } from "@/lib/course-session-access";
import {
  getClassroomCourseware,
  getClassroomRuntimeSnapshot,
  touchClassroomMember,
} from "@/lib/classroom/server/runtime";
import { classroomCapabilities } from "@/lib/classroom/policy";
import { classroomModePolicy } from "@/lib/classroom/mode";
import { verifyRecorderToken } from "@/lib/classroom/server/recorder-token";
import { issueAgoraSignalingCredential } from "@/lib/classroom/signaling/agora-server";
import { getWhiteboardProvider } from "@/lib/classroom/whiteboard/provider-factory";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { getClassroomCaptions } from "@/lib/classroom/server/captions";
import { getClassroomQuestions } from "@/lib/classroom/server/questions";
import {
  ensureClassroomSpaceAssignment,
  getClassroomSpaces,
} from "@/lib/classroom/server/spaces";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function publicMessage(message: {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  scope: string;
  spaceId: string | null;
  recipientId: string | null;
  kind: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
}): ClassroomMessageSnapshot {
  return {
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    senderRole:
      message.senderRole === "teacher" || message.senderRole === "assistant"
        ? message.senderRole
        : "student",
    scope:
      message.scope === "room" ||
      message.scope === "staff" ||
      message.scope === "direct"
        ? message.scope
        : "classroom",
    spaceId: message.spaceId,
    recipientId: message.recipientId,
    kind: message.kind === "system" ? "system" : "text",
    content: message.deletedAt ? "" : message.content,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      courseId?: unknown;
      sessionId?: unknown;
      shareAccess?: unknown;
      recorderToken?: unknown;
    };
    const suppliedCourseId =
      typeof body.courseId === "string" ? body.courseId.trim() : "";
    const suppliedSessionId =
      typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const referenceId = suppliedSessionId || suppliedCourseId;
    const shareAccess =
      typeof body.shareAccess === "string" ? body.shareAccess.trim() : "";
    if (!referenceId) {
      return NextResponse.json(
        { error: "sessionId or courseId is required" },
        { status: 400 },
      );
    }
    const recorderToken =
      typeof body.recorderToken === "string" ? body.recorderToken.trim() : "";
    const recorder = recorderToken
      ? await verifyRecorderToken(recorderToken, referenceId)
      : false;
    const session = recorder ? null : await getSessionFromRequest(request);
    if (!recorder && !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = recorder
      ? null
      : await resolveCourseSessionAccess(referenceId, session!.userId, {
          shareAccessToken: shareAccess || undefined,
          userIdAliases: [session!.name],
        });
    if (access && !access.ok) {
      return NextResponse.json(
        { error: access.reason, code: access.code },
        { status: access.httpStatus },
      );
    }

    const resolvedLesson = recorder
      ? await prisma.courseSession.findUnique({
          where: { id: referenceId },
          select: { courseId: true },
        })
      : null;
    const sessionId = recorder ? referenceId : access!.sessionId;
    const courseId = recorder ? resolvedLesson?.courseId || "" : access!.courseId;
    const lesson = await prisma.courseSession.findFirst({
      where: { id: sessionId, courseId },
      select: {
        id: true,
        roomUuid: true,
        roomType: true,
        title: true,
        leadTeacherName: true,
        status: true,
        startTime: true,
        endTime: true,
        classroomProvider: true,
        recordingProvider: true,
        course: { select: { name: true } },
        recordings: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, mode: true, fallbackFrom: true },
        },
      },
    });
    if (!lesson) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 },
      );
    }
    const role: ClassroomRole = recorder ? "student" : access!.role;
    const modePolicy = classroomModePolicy(lesson.roomType);
    const channelName = lesson.roomUuid;
    const userId = recorder
      ? `recorder-${courseId.replace(/-/g, "").slice(0, 40)}`
      : session!.userId;
    if (!recorder) {
      await touchClassroomMember(
        courseId,
        session!,
        role,
        modePolicy,
        sessionId,
      );
      if (modePolicy.allowBreakouts) {
        await ensureClassroomSpaceAssignment({
          courseId,
          sessionId,
          userId: session!.userId,
          displayName:
            session!.displayName || session!.name || session!.userId,
          avatar: session!.avatar || "",
          role,
        });
      }
    }
    const runtimeSnapshot = await getClassroomRuntimeSnapshot(courseId, sessionId);
    const member = recorder
      ? null
      : await prisma.classroomMemberState.findUnique({
          where: {
            sessionId_userId: { sessionId, userId },
          },
          select: { whiteboardWritable: true },
        });

    const classroomProvider = getClassroomServerProvider(
      lesson.classroomProvider,
    );
    const recordingProvider = getRecordingProvider(lesson.recordingProvider);
    const credential = classroomProvider.issueCredential({
      channelName,
      userId,
      role,
      scenario: modePolicy.rtcScenario,
      publisher:
        !recorder &&
        runtimeSnapshot.status !== "ended" &&
        (role === "teacher" ||
          (role === "assistant" && modePolicy.mode !== "largeClass") ||
          (role === "student" && modePolicy.defaultStudentOnStage)),
      allowScreenShare:
        !recorder &&
        (role === "teacher" ||
          (role === "assistant" && modePolicy.mode !== "largeClass") ||
          (role === "student" && modePolicy.studentCanShareWhenOnStage)),
    });

    if (!recorder && role === "student") {
      await closeOpenAttendanceSessionsForLesson(sessionId, session!.userId);
      await prisma.courseAttendance.create({
        data: {
          courseId,
          sessionId,
          studentId: session!.userId,
          studentName:
            session!.displayName || session!.name || session!.userId,
          studentAvatar: session!.avatar || "",
          enteredAt: new Date(),
        },
      });
    }

    const visibleMessageWhere = recorder
      ? { sessionId, scope: "classroom" }
      : {
          sessionId,
          OR: [
            { scope: "classroom" },
            ...(role !== "student" ? [{ scope: "staff" }] : []),
            {
              scope: "direct",
              OR: [{ senderId: userId }, { recipientId: userId }],
            },
            {
              scope: "room",
              ...(role === "teacher"
                ? {}
                : {
                    space: {
                      members: { some: { userId, active: true } },
                    },
                  }),
            },
          ],
        };
    const [courseware, whiteboard, messages, captions, spaces, questions] = await Promise.all([
      getClassroomCourseware(courseId, role, sessionId),
      getWhiteboardProvider().issueJoinCredential({
        courseId: sessionId,
        userId,
        role,
        writable: member?.whiteboardWritable ?? false,
      }),
      prisma.classroomMessage.findMany({
        where: visibleMessageWhere,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      getClassroomCaptions(courseId, 100, sessionId),
      !recorder && modePolicy.allowBreakouts
        ? getClassroomSpaces({ courseId, sessionId, viewerId: userId, role })
        : Promise.resolve([]),
      !recorder && modePolicy.showPublicQuestions
        ? getClassroomQuestions({ courseId, sessionId, viewerId: userId, role })
        : Promise.resolve([]),
    ]);

    return NextResponse.json(
      {
        mode: modePolicy.mode,
        modePolicy,
        credential,
        mediaProfile: classroomMediaProfile,
        course: {
          id: courseId,
          sessionId,
          name: lesson.title || lesson.course.name,
          roomType: lesson.roomType,
          teacherName: lesson.leadTeacherName,
          status: lesson.status,
          startTime: lesson.startTime.toISOString(),
          endTime: lesson.endTime.toISOString(),
        },
        runtime: runtimeSnapshot,
        capabilities: recorder
          ? {
              canStartClass: false,
              canEndClass: false,
              canControlRecording: false,
              canManageStage: false,
              canManageMembers: false,
              canManageChat: false,
              canManageWhiteboard: false,
              canManageInterpretation: false,
              canShareScreen: false,
            }
          : classroomCapabilities(role, modePolicy),
        signaling: recorder
          ? null
          : issueAgoraSignalingCredential(sessionId, session!.userId),
        whiteboard,
        courseware,
        messages: messages.reverse().map(publicMessage),
        spaces,
        questions,
        captions,
        recording: {
          enabled: recordingProvider.isConfigured(),
          status: lesson.recordings[0]?.status ?? null,
          mode:
            lesson.recordings[0]?.mode === "web"
              ? "web"
              : lesson.recordings[0]?.mode === "mix"
                ? "mix"
                : null,
          fallbackFrom: lesson.recordings[0]?.fallbackFrom ?? null,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      },
    );
  } catch (error) {
    if (error instanceof ClassroomProviderConfigurationError) {
      console.error("[classroom:session] provider configuration", {
        message: error.message,
        missingVariables: error.missingVariables,
      });
      return NextResponse.json(
        {
          error: "课堂服务尚未配置完成",
          code: "classroom_provider_not_configured",
          missingVariables: error.missingVariables,
        },
        { status: 503 },
      );
    }

    console.error("[classroom:session] failed", error);
    return NextResponse.json(
      { error: "Unable to create classroom session" },
      { status: 500 },
    );
  }
}
