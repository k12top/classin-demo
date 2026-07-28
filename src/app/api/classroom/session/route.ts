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
import { closeOpenAttendanceSessions } from "@/lib/course-attendance";
import { ensureStudentEnrolledInCourse } from "@/lib/course-enrollment";
import { resolveCourseAccess } from "@/lib/course-access";
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
import { courseIdToRoomUuid } from "@/lib/course-room";
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
      shareAccess?: unknown;
      recorderToken?: unknown;
    };
    const courseId =
      typeof body.courseId === "string" ? body.courseId.trim() : "";
    const shareAccess =
      typeof body.shareAccess === "string" ? body.shareAccess.trim() : "";
    if (!courseId) {
      return NextResponse.json(
        { error: "courseId is required" },
        { status: 400 },
      );
    }
    const recorderToken =
      typeof body.recorderToken === "string" ? body.recorderToken.trim() : "";
    const recorder = recorderToken
      ? await verifyRecorderToken(recorderToken, courseId)
      : false;
    const session = recorder ? null : await getSessionFromRequest(request);
    if (!recorder && !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const access = recorder
      ? null
      : await resolveCourseAccess(courseId, session!.userId, {
          shareAccessToken: shareAccess || undefined,
          userIdAliases: [session!.name],
        });
    if (access && !access.ok) {
      return NextResponse.json(
        { error: access.reason, code: access.code },
        { status: access.httpStatus },
      );
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        roomUuid: true,
        roomType: true,
        name: true,
        teacherName: true,
        status: true,
        startTime: true,
        endTime: true,
        classroomProvider: true,
        recordingProvider: true,
        recordings: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, mode: true, fallbackFrom: true },
        },
      },
    });
    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 },
      );
    }
    const role: ClassroomRole = recorder ? "student" : access!.role;
    const modePolicy = classroomModePolicy(course.roomType);
    const channelName = recorder
      ? courseIdToRoomUuid(course.id, course.roomUuid)
      : access!.roomUuid;
    const userId = recorder
      ? `recorder-${courseId.replace(/-/g, "").slice(0, 40)}`
      : session!.userId;
    if (!recorder) {
      await touchClassroomMember(courseId, session!, role, modePolicy);
      if (modePolicy.allowBreakouts) {
        await ensureClassroomSpaceAssignment({
          courseId,
          userId: session!.userId,
          displayName:
            session!.displayName || session!.name || session!.userId,
          avatar: session!.avatar || "",
          role,
        });
      }
    }
    const runtimeSnapshot = await getClassroomRuntimeSnapshot(courseId);
    const member = recorder
      ? null
      : await prisma.classroomMemberState.findUnique({
          where: {
            courseId_userId: { courseId, userId },
          },
          select: { whiteboardWritable: true },
        });

    const classroomProvider = getClassroomServerProvider(
      course.classroomProvider,
    );
    const recordingProvider = getRecordingProvider(course.recordingProvider);
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
      await ensureStudentEnrolledInCourse(courseId, session!);
      await closeOpenAttendanceSessions(courseId, session!.userId);
      await prisma.courseAttendance.create({
        data: {
          courseId,
          studentId: session!.userId,
          studentName:
            session!.displayName || session!.name || session!.userId,
          studentAvatar: session!.avatar || "",
          enteredAt: new Date(),
        },
      });
    }

    const visibleMessageWhere = recorder
      ? { courseId, scope: "classroom" }
      : {
          courseId,
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
      getClassroomCourseware(courseId, role),
      getWhiteboardProvider().issueJoinCredential({
        courseId,
        userId,
        role,
        writable: member?.whiteboardWritable ?? false,
      }),
      prisma.classroomMessage.findMany({
        where: visibleMessageWhere,
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      getClassroomCaptions(courseId),
      !recorder && modePolicy.allowBreakouts
        ? getClassroomSpaces({ courseId, viewerId: userId, role })
        : Promise.resolve([]),
      !recorder && modePolicy.showPublicQuestions
        ? getClassroomQuestions({ courseId, viewerId: userId, role })
        : Promise.resolve([]),
    ]);

    return NextResponse.json(
      {
        mode: modePolicy.mode,
        modePolicy,
        credential,
        mediaProfile: classroomMediaProfile,
        course: {
          id: course.id,
          name: course.name,
          roomType: course.roomType,
          teacherName: course.teacherName,
          status: course.status,
          startTime: course.startTime?.toISOString() ?? null,
          endTime: course.endTime?.toISOString() ?? null,
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
          : issueAgoraSignalingCredential(courseId, session!.userId),
        whiteboard,
        courseware,
        messages: messages.reverse().map(publicMessage),
        spaces,
        questions,
        captions,
        recording: {
          enabled: recordingProvider.isConfigured(),
          status: course.recordings[0]?.status ?? null,
          mode:
            course.recordings[0]?.mode === "web"
              ? "web"
              : course.recordings[0]?.mode === "mix"
                ? "mix"
                : null,
          fallbackFrom: course.recordings[0]?.fallbackFrom ?? null,
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
