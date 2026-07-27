import { NextRequest, NextResponse } from "next/server";
import { classroomMediaProfile } from "@/lib/classroom/config";
import {
  ClassroomProviderConfigurationError,
} from "@/lib/classroom/providers/agora/server";
import {
  getClassroomServerProvider,
  getRecordingProvider,
} from "@/lib/classroom/server/provider-factory";
import { closeOpenAttendanceSessions } from "@/lib/course-attendance";
import { ensureStudentEnrolledInCourse } from "@/lib/course-enrollment";
import { resolveCourseAccess } from "@/lib/course-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      courseId?: unknown;
      shareAccess?: unknown;
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

    const access = await resolveCourseAccess(courseId, session.userId, {
      shareAccessToken: shareAccess || undefined,
      userIdAliases: [session.name],
    });
    if (!access.ok) {
      return NextResponse.json(
        {
          error: access.reason,
          code: access.code,
        },
        { status: access.httpStatus },
      );
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
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
          select: { status: true },
        },
      },
    });
    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 },
      );
    }

    const classroomProvider = getClassroomServerProvider(
      course.classroomProvider,
    );
    const recordingProvider = getRecordingProvider(course.recordingProvider);
    const credential = classroomProvider.issueCredential({
      channelName: access.roomUuid,
      userId: session.userId,
      role: access.role,
    });

    if (access.role === "student") {
      await ensureStudentEnrolledInCourse(courseId, session);
      await closeOpenAttendanceSessions(courseId, session.userId);
      await prisma.courseAttendance.create({
        data: {
          courseId,
          studentId: session.userId,
          studentName:
            session.displayName || session.name || session.userId,
          studentAvatar: session.avatar || "",
          enteredAt: new Date(),
        },
      });
    }

    return NextResponse.json(
      {
        credential,
        mediaProfile: classroomMediaProfile,
        course: {
          id: course.id,
          name: course.name,
          teacherName: course.teacherName,
          status: course.status,
          startTime: course.startTime?.toISOString() ?? null,
          endTime: course.endTime?.toISOString() ?? null,
        },
        recording: {
          enabled: recordingProvider.isConfigured(),
          status: course.recordings[0]?.status ?? null,
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
      { error: "无法创建课堂会话" },
      { status: 500 },
    );
  }
}

