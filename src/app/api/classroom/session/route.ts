import { after, NextRequest, NextResponse } from "next/server";
import { classroomMediaProfile } from "@/lib/classroom/config";
import type {
  ClassroomMessageSnapshot,
  ClassroomRole,
  ClassroomWhiteboardCredential,
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
  getClassroomEngagementSnapshot,
  getClassroomRuntimeSnapshot,
  touchClassroomMember,
} from "@/lib/classroom/server/runtime";
import { classroomCapabilities } from "@/lib/classroom/policy";
import { classroomModePolicy } from "@/lib/classroom/mode";
import { verifyRecorderToken } from "@/lib/classroom/server/recorder-token";
import { recoverInterruptedRecordingForSession } from "@/lib/classroom/server/recording-orchestrator";
import { issueAgoraSignalingCredential } from "@/lib/classroom/signaling/agora-server";
import { getWhiteboardProvider } from "@/lib/classroom/whiteboard/provider-factory";
import { prisma } from "@/lib/db";
import { databaseUnavailableResponse } from "@/lib/database-response";
import { getSessionFromRequest } from "@/lib/session";
import { getClassroomCaptions } from "@/lib/classroom/server/captions";
import { ensureClassroomSpaceAssignment } from "@/lib/classroom/server/spaces";
import { classroomInterpretationAvailability } from "@/lib/classroom/server/transcription-orchestrator";
import { casdoorUserIdCandidates } from "@/lib/course-teacher";

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
  const bootstrapStartedAt = performance.now();
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
    let member: Awaited<ReturnType<typeof touchClassroomMember>> | null = null;
    if (!recorder) {
      member = await touchClassroomMember(
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
    const [runtimeSnapshot, engagementSnapshot] = await Promise.all([
      getClassroomRuntimeSnapshot(courseId, sessionId, { ensure: false }),
      getClassroomEngagementSnapshot(sessionId),
    ]);

    // Leaving a teaching tab never stops the cloud recorder. If the provider
    // did stop unexpectedly while the teacher was away, rejoining the live
    // session provides an immediate recovery path in addition to cron.
    if (!recorder && role === "teacher" && runtimeSnapshot.status === "live") {
      after(() =>
        recoverInterruptedRecordingForSession(courseId, sessionId).catch(
          (error) => {
            console.warn("[classroom:recording] re-entry recovery failed", {
              courseId,
              sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        ),
      );
    }

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
      const attendanceSession = session!;
      after(async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          const attendanceAliases = Array.from(
            new Set(
              [attendanceSession.userId, attendanceSession.name || ""]
                .flatMap(casdoorUserIdCandidates)
                .filter(Boolean),
            ),
          );
          await prisma.courseSessionStudentSubmission.updateMany({
            where: {
              sessionId,
              studentId: { in: attendanceAliases },
              leaveStatus: "active",
            },
            data: {
              leaveStatus: "withdrawn",
              leaveWithdrawnAt: new Date(),
            },
          });
          await closeOpenAttendanceSessionsForLesson(
            sessionId,
            attendanceSession.userId,
          );
          await prisma.courseAttendance.create({
            data: {
              courseId,
              sessionId,
              studentId: attendanceSession.userId,
              studentName:
                attendanceSession.displayName ||
                attendanceSession.name ||
                attendanceSession.userId,
              studentAvatar: attendanceSession.avatar || "",
              enteredAt: new Date(),
            },
          });
        } catch (error) {
          console.warn("[classroom:attendance] deferred entry failed", {
            courseId,
            sessionId,
            userId: attendanceSession.userId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
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
    const whiteboardProvider = getWhiteboardProvider();
    const deferredWhiteboard: ClassroomWhiteboardCredential = {
      enabled: false,
      provider: "netless",
      writable: false,
      error: "whiteboard_pending",
    };
    const [
      courseware,
      whiteboard,
      messages,
      captions,
      spaces,
      questions,
      interpretationAvailability,
    ] = await Promise.all([
      recorder
        ? getClassroomCourseware(courseId, role, sessionId)
        : Promise.resolve([]),
      recorder
        ? whiteboardProvider.issueJoinCredential({
            courseId,
            sessionId,
            userId,
            role,
            writable: member?.whiteboardWritable ?? false,
          })
        : Promise.resolve(deferredWhiteboard),
      recorder
        ? prisma.classroomMessage.findMany({
            where: visibleMessageWhere,
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : Promise.resolve([]),
      recorder
        ? getClassroomCaptions(courseId, 100, sessionId)
        : Promise.resolve([]),
      Promise.resolve([]),
      Promise.resolve([]),
      classroomInterpretationAvailability(),
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
        engagement: engagementSnapshot,
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
              canGiveReward: false,
              canRunEngagement: false,
              canParticipateInEngagement: false,
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
        interpretationAvailability,
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
          "Server-Timing": `classroom-bootstrap;dur=${(
            performance.now() - bootstrapStartedAt
          ).toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    const unavailable = databaseUnavailableResponse(error);
    if (unavailable) return unavailable;

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
