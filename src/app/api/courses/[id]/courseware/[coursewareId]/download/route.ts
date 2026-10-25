import { coursewareFileResponse } from "@/lib/courseware-file-response";
import { NextRequest, NextResponse } from "next/server";
import {
  CoursewareStorageConfigurationError,
} from "@/lib/aliyun-oss";
import {
  getCoursewareLessons,
  isCoursewareAvailableInSession,
  resolveCoursewareAccess,
} from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; coursewareId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: courseId, coursewareId } = await params;
  const requestedSessionId = request.nextUrl.searchParams.get("sessionId")?.trim() || null;
  const access = await resolveCoursewareAccess(
    session,
    courseId,
    requestedSessionId,
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courseware = await prisma.courseware.findFirst({
    where: { id: coursewareId, courseId },
    select: {
      id: true,
      courseId: true,
      sessionId: true,
      name: true,
      url: true,
      studentCanView: true,
      studentCanDownload: true,
    },
  });
  if (!courseware) return NextResponse.json({ error: "Courseware not found" }, { status: 404 });
  if (
    requestedSessionId &&
    !(await isCoursewareAvailableInSession(courseware, requestedSessionId))
  ) {
    return NextResponse.json({ error: "该课件未开放给此课次" }, { status: 403 });
  }
  let teachingFile = access.teaching;
  if (!requestedSessionId && !access.teaching) {
    const lessons = await getCoursewareLessons(session, courseId);
    const exposed = await Promise.all(lessons.map(lesson => isCoursewareAvailableInSession(courseware, lesson.id)));
    teachingFile = lessons.some((lesson, index) => lesson.teaching && exposed[index]);
    if ((lessons.length || courseware.sessionId || access.scope === "session") && !exposed.some(Boolean)) {
      return NextResponse.json({ code: "COURSEWARE_FORBIDDEN", error: "Courseware is not available in your lessons" }, { status: 403 });
    }
  }
  if (
    !teachingFile &&
    (!courseware.studentCanView || !courseware.studentCanDownload)
  ) {
    return NextResponse.json({ error: "该课件未开放下载" }, { status: 403 });
  }

  try {
    return await coursewareFileResponse(courseware);
  } catch (error) {
    console.error("Failed to create OSS courseware download URL:", error);
    if (error instanceof CoursewareStorageConfigurationError) {
      return NextResponse.json(
        {
          error: `课件存储配置未生效：缺少 ${error.missingVariables.join(", ")}`,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "无法生成课件下载地址，请检查 OSS 区域、Bucket 和访问权限" },
      { status: 500 },
    );
  }
}
