import { NextRequest, NextResponse } from "next/server";
import {
  getCoursewareObjectKey,
  getCoursewareOssClient,
} from "@/lib/aliyun-oss";
import { canAccessCourseware } from "@/lib/courseware-access";
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
  if (!(await canAccessCourseware(session, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courseware = await prisma.courseware.findFirst({
    where: { id: coursewareId, courseId },
    select: { name: true, url: true },
  });
  if (!courseware) return NextResponse.json({ error: "Courseware not found" }, { status: 404 });

  const objectKey = getCoursewareObjectKey(courseware.url);
  if (!objectKey) return NextResponse.redirect(courseware.url);

  try {
    const downloadUrl = getCoursewareOssClient().signatureUrl(objectKey, {
      expires: 10 * 60,
      response: {
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(courseware.name)}`,
      },
    });
    return NextResponse.redirect(downloadUrl);
  } catch (error) {
    console.error("Failed to create OSS courseware download URL:", error);
    return NextResponse.json({ error: "Courseware storage is not configured" }, { status: 503 });
  }
}
