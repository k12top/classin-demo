import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCoursewareObjectKey, getCoursewareOssClient } from "@/lib/aliyun-oss";
import { assertCanTeachCourse } from "@/lib/course-teacher";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { startWhiteboardConversion } from "@/lib/whiteboard-convert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const CONVERTIBLE_EXTENSIONS = new Set(["ppt", "pptx", "pdf", "doc", "docx", "png", "jpg", "jpeg", "gif"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; coursewareId: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: courseId, coursewareId } = await params;
  if (session.role !== "teacher" || !(await assertCanTeachCourse(session.userId, courseId))) {
    return NextResponse.json({ error: "只有授课教师可以修改课件权限" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as {
    studentCanView?: unknown; studentCanDownload?: unknown; whiteboardEnabled?: unknown;
  } | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "请求内容无效" }, { status: 400 });
  const current = await prisma.courseware.findFirst({ where: { id: coursewareId, courseId } });
  if (!current) return NextResponse.json({ error: "课件不存在" }, { status: 404 });

  const start = body.whiteboardEnabled === true && (
    !current.whiteboardEnabled || current.taskStatus === "Failed" ||
    (!current.taskUuid && (current.taskStatus !== "Pending" || Date.now() - current.updatedAt.getTime() > 60_000))
  );
  const objectKey = start ? getCoursewareObjectKey(current.url) : null;
  if (start && !CONVERTIBLE_EXTENSIONS.has(current.ext.toLowerCase())) {
    return NextResponse.json({ error: "该文件格式只能查看或下载，不能加入白板" }, { status: 400 });
  }
  if (start && !objectKey) return NextResponse.json({ error: "只有存储在 OSS 的课件才能加入白板" }, { status: 409 });

  const reset = body.whiteboardEnabled === false || start;
  // Claim before calling the provider so concurrent clicks cannot create duplicate tasks.
  const claimed = await prisma.courseware.updateMany({
    where: { id: current.id, updatedAt: current.updatedAt },
    data: {
      ...(typeof body.studentCanView === "boolean" ? { studentCanView: body.studentCanView } : {}),
      ...(typeof body.studentCanDownload === "boolean" ? { studentCanDownload: body.studentCanDownload } : {}),
      ...(typeof body.whiteboardEnabled === "boolean" ? { whiteboardEnabled: body.whiteboardEnabled } : {}),
      ...(reset ? { taskUuid: null, taskStatus: "Pending", conversion: Prisma.DbNull, conversionError: null } : {}),
    },
  });
  if (!claimed.count) return NextResponse.json({ error: "课件状态已更新，请刷新后重试" }, { status: 409 });
  let updated = await prisma.courseware.findUniqueOrThrow({ where: { id: current.id } });
  let responseStatus = 200;
  if (start) {
    const attemptUpdatedAt = updated.updatedAt;
    const attemptWhere = { id: current.id, whiteboardEnabled: true, taskUuid: null, taskStatus: "Pending", updatedAt: attemptUpdatedAt };
    try {
      const sourceUrl = getCoursewareOssClient().signatureUrl(objectKey!, { expires: 60 * 60 });
      const task = await startWhiteboardConversion(sourceUrl, current.ext);
      await prisma.courseware.updateMany({ where: attemptWhere, data: {
        taskUuid: task.taskUuid, taskStatus: task.status, type: task.type, conversionError: null,
        ...(task.region ? { conversion: { region: task.region } } : {}),
      } });
    } catch (error) {
      await prisma.courseware.updateMany({ where: attemptWhere, data: {
        taskStatus: "Failed", conversionError: error instanceof Error ? error.message : "课件转换失败",
      } });
      responseStatus = 502;
    }
    updated = await prisma.courseware.findUniqueOrThrow({ where: { id: current.id } });
  }
  await prisma.classroomRuntime.updateMany({ where: { courseId }, data: { revision: { increment: 1 } } });
  return NextResponse.json({
    ...(responseStatus !== 200 ? { error: updated.conversionError } : {}),
    courseware: { ...updated, url: undefined, downloadUrl: `/api/courses/${courseId}/courseware/${updated.id}/download` },
  }, { status: responseStatus });
}
