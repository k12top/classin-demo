import { NextRequest, NextResponse } from "next/server";
import {
  getCoursewareObjectKey,
  getCoursewareOssClient,
} from "@/lib/aliyun-oss";
import { assertCanTeachCourse } from "@/lib/course-teacher";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { startWhiteboardConversion } from "@/lib/whiteboard-convert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONVERTIBLE_EXTENSIONS = new Set([
  "ppt",
  "pptx",
  "pdf",
  "doc",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "gif",
]);

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; coursewareId: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId, coursewareId } = await params;
  if (
    session.role !== "teacher" ||
    !(await assertCanTeachCourse(session.userId, courseId))
  ) {
    return NextResponse.json(
      { error: "只有授课教师可以修改课件权限" },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    studentCanView?: unknown;
    studentCanDownload?: unknown;
    whiteboardEnabled?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
  }
  const current = await prisma.courseware.findFirst({
    where: { id: coursewareId, courseId },
  });
  if (!current) {
    return NextResponse.json({ error: "课件不存在" }, { status: 404 });
  }

  const whiteboardEnabled =
    typeof body.whiteboardEnabled === "boolean"
      ? body.whiteboardEnabled
      : current.whiteboardEnabled;
  const baseUpdate = {
    ...(typeof body.studentCanView === "boolean"
      ? { studentCanView: body.studentCanView }
      : {}),
    ...(typeof body.studentCanDownload === "boolean"
      ? { studentCanDownload: body.studentCanDownload }
      : {}),
    ...(typeof body.whiteboardEnabled === "boolean"
      ? { whiteboardEnabled: body.whiteboardEnabled }
      : {}),
  };
  let updated = await prisma.courseware.update({
    where: { id: current.id },
    data: {
      ...baseUpdate,
      ...(!whiteboardEnabled
        ? {
            taskUuid: null,
            taskStatus: "Pending",
            conversion: undefined,
            conversionError: null,
          }
        : {}),
    },
  });

  if (
    whiteboardEnabled &&
    !current.whiteboardEnabled &&
    !current.taskUuid
  ) {
    if (!CONVERTIBLE_EXTENSIONS.has(current.ext.toLowerCase())) {
      updated = await prisma.courseware.update({
        where: { id: current.id },
        data: {
          whiteboardEnabled: false,
          taskStatus: "Failed",
          conversionError: "该文件格式只能查看或下载，不能加入白板",
        },
      });
      return NextResponse.json(
        {
          error: updated.conversionError,
          courseware: { ...updated, url: undefined },
        },
        { status: 400 },
      );
    }
    const objectKey = getCoursewareObjectKey(current.url);
    if (!objectKey) {
      return NextResponse.json(
        { error: "只有存储在 OSS 的课件才能加入白板" },
        { status: 409 },
      );
    }
    try {
      const sourceUrl = getCoursewareOssClient().signatureUrl(objectKey, {
        expires: 60 * 60,
      });
      const task = await startWhiteboardConversion(sourceUrl, current.ext);
      updated = await prisma.courseware.update({
        where: { id: current.id },
        data: {
          taskUuid: task.taskUuid,
          taskStatus: task.status,
          type: task.type,
          conversionError: null,
        },
      });
    } catch (error) {
      updated = await prisma.courseware.update({
        where: { id: current.id },
        data: {
          taskStatus: "Failed",
          conversionError:
            error instanceof Error ? error.message : "课件转换失败",
        },
      });
      return NextResponse.json(
        {
          error: updated.conversionError,
          courseware: { ...updated, url: undefined },
        },
        { status: 502 },
      );
    }
  }

  await prisma.classroomRuntime.updateMany({
    where: { courseId },
    data: { revision: { increment: 1 } },
  });
  return NextResponse.json({
    courseware: {
      ...updated,
      url: undefined,
      downloadUrl: `/api/courses/${courseId}/courseware/${updated.id}/download`,
    },
  });
}
