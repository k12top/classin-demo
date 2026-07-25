/**
 * Token generation API — session-bound user + course access
 */
import { NextRequest, NextResponse } from "next/server";
import { agoraRoleTypeForClassroomRole } from "@/lib/agora-classroom-role";
import {
  AgoraClassroomRestError,
  AgoraClassroomScheduleConflictError,
  ensureAgoraClassroom,
} from "@/lib/agora-classroom-rest";
import { buildRoomUserToken } from "@/lib/agora-token";
import { getSessionFromRequest } from "@/lib/session";
import { resolveCourseAccess } from "@/lib/course-access";

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized — please log in first" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { roomUuid, courseId, userUuid, shareAccess } = body;

    if (!roomUuid || !courseId) {
      return NextResponse.json(
        { error: "Missing required fields: roomUuid, courseId" },
        { status: 400 }
      );
    }

    if (
      userUuid !== undefined &&
      userUuid !== null &&
      String(userUuid) !== session.userId
    ) {
      return NextResponse.json(
        { error: "userUuid does not match the signed-in user" },
        { status: 403 }
      );
    }

    const access = await resolveCourseAccess(String(courseId), session.userId, {
      shareAccessToken:
        typeof shareAccess === "string" ? shareAccess : undefined,
      userIdAliases: [session.name],
    });
    if (!access.ok) {
      return NextResponse.json(
        { error: access.reason || "Not allowed for this course" },
        { status: access.httpStatus === 404 ? 404 : 403 }
      );
    }

    if (String(roomUuid) !== access.roomUuid) {
      return NextResponse.json(
        { error: "roomUuid does not match this course" },
        { status: 403 }
      );
    }

    const roomSchedule = await ensureAgoraClassroom({
      roomUuid: access.roomUuid,
      roomName: access.roomName,
      roomType: access.roomType,
      startTime: access.startTime,
      endTime: access.endTime,
    });

    const role = agoraRoleTypeForClassroomRole(access.role);

    const appId = process.env.AGORA_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: "Server misconfiguration: missing AGORA_APP_ID" },
        { status: 500 }
      );
    }

    const token = buildRoomUserToken(roomUuid, session.userId, role);

    if (access.role === "student") {
      const { ensureStudentEnrolledInCourse } = await import("@/lib/course-enrollment");
      await ensureStudentEnrolledInCourse(String(courseId), session);
      await prismaCourseAttendanceCreate(String(courseId), session);
    }

    const qs = new URLSearchParams({
      roomUuid: String(roomUuid),
      roomType: String(access.roomType),
      roomName: access.roomName,
      courseId: String(courseId),
    });
    if (typeof shareAccess === "string" && shareAccess.trim()) {
      qs.set("shareAccess", shareAccess.trim());
    }
    const classroomUrl = `/classroom?${qs.toString()}`;

    return NextResponse.json({
      token,
      appId,
      classroomUrl,
      role: access.role,
      roleType: role,
      roomSchedule,
    });
  } catch (error) {
    if (error instanceof AgoraClassroomScheduleConflictError) {
      console.error("[classroom:agora-room] schedule conflict", {
        roomUuid: error.roomUuid,
        expected: error.expected,
        actual: error.actual,
      });
      return NextResponse.json(
        {
          error:
            "声网课堂已使用错误的课程时长创建，请由老师重新开启课堂后再进入",
          code: "agora_room_schedule_conflict",
        },
        { status: 409 },
      );
    }

    if (error instanceof AgoraClassroomRestError) {
      console.error("[classroom:agora-room] REST failure", {
        message: error.message,
        status: error.status,
        agoraCode: error.agoraCode,
      });
      return NextResponse.json(
        {
          error: "暂时无法准备声网课堂，请稍后重试",
          code: "agora_room_prepare_failed",
        },
        { status: 503 },
      );
    }

    console.error("Token generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}

async function prismaCourseAttendanceCreate(
  courseId: string,
  session: NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>
) {
  const { prisma } = await import("@/lib/db");
  const { closeOpenAttendanceSessions } = await import("@/lib/course-attendance");
  await closeOpenAttendanceSessions(courseId, session.userId);
  await prisma.courseAttendance.create({
    data: {
      courseId,
      studentId: session.userId,
      studentName: session.displayName || session.name || session.userId,
      studentAvatar: session.avatar || "",
      enteredAt: new Date(),
    },
  });
}
