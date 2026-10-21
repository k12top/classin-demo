import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  getCoursewareOssClient,
  isCoursewareObjectKey,
  toCoursewareStorageUrl,
} from "@/lib/aliyun-oss";
import { resolveCoursewareAccess } from "@/lib/courseware-access";
import { assertCanUploadCourseware, COURSEWARE_UPLOAD_FORBIDDEN } from "@/lib/courseware-upload-access";
import { refreshCoursewareConversions } from "@/lib/courseware-conversion";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  const requestedSessionId = request.nextUrl.searchParams.get("sessionId")?.trim() || null;

  try {
    const access = await resolveCoursewareAccess(
      session,
      courseId,
      requestedSessionId,
    );
    if (!access.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const teaching = access.teaching;
    let lessonFilter: Prisma.CoursewareWhereInput = { sessionId: null };
    if (requestedSessionId) {
      const lesson = await prisma.courseSession.findFirst({
        where: { id: requestedSessionId, courseId },
        select: { id: true },
      });
      if (!lesson) {
        return NextResponse.json({ error: "Course session not found" }, { status: 404 });
      }
      const rules = await prisma.courseSessionCourseware.findMany({
        where: { sessionId: lesson.id },
        select: { coursewareId: true, action: true },
      });
      const excludedIds = rules
        .filter((rule) => rule.action === "exclude")
        .map((rule) => rule.coursewareId);
      const includedIds = rules
        .filter((rule) => rule.action === "include")
        .map((rule) => rule.coursewareId);
      lessonFilter = {
        OR: [
          { sessionId: null, id: { notIn: excludedIds } },
          { sessionId: lesson.id },
          ...(includedIds.length ? [{ id: { in: includedIds } }] : []),
        ],
      };
    }
    const itemWhere: Prisma.CoursewareWhereInput = {
      courseId,
      ...lessonFilter,
      ...(!teaching ? { studentCanView: true } : {}),
    };

    const items = await refreshCoursewareConversions(await prisma.courseware.findMany({
      where: itemWhere,
      orderBy: { createdAt: "desc" },
    }));

    return NextResponse.json(
      {
        courseware: items.map((item) => ({
          ...item,
          url: undefined,
          downloadUrl:
            teaching || item.studentCanDownload
              ? `/api/courses/${courseId}/courseware/${item.id}/download${
                  requestedSessionId
                    ? `?sessionId=${encodeURIComponent(requestedSessionId)}`
                    : ""
                }`
              : null,
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch courseware:", error);
    return NextResponse.json({ error: "Failed to fetch courseware" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  try {
    if (
      !(await assertCanUploadCourseware(session, courseId))
    ) {
      return NextResponse.json({ code: COURSEWARE_UPLOAD_FORBIDDEN, error: "Only assigned course teachers can upload courseware" }, { status: 403 });
    }

    const body = await request.json();
    const { name, objectKey, ext, size } = body;

    if (!name?.trim() || !objectKey?.trim() || !ext?.trim()) {
      return NextResponse.json(
        { error: "Missing required fields: name, objectKey, ext" },
        { status: 400 }
      );
    }

    const cleanExt = ext.toLowerCase().replace(/^\./, "");
    const cleanObjectKey = objectKey.trim();
    if (!isCoursewareObjectKey(courseId, cleanObjectKey)) {
      return NextResponse.json({ error: "Invalid courseware storage key" }, { status: 400 });
    }

    try {
      await getCoursewareOssClient().head(cleanObjectKey);
    } catch {
      return NextResponse.json({ error: "The uploaded courseware was not found" }, { status: 400 });
    }

    const item = await prisma.courseware.create({
      data: {
        courseId,
        name: name.trim(),
        ext: cleanExt,
        size: size || 0,
        url: toCoursewareStorageUrl(cleanObjectKey),
        type: "file",
        taskStatus: "Finished",
        studentCanView: true,
        studentCanDownload: true,
        whiteboardEnabled: false,
      },
    });

    return NextResponse.json(
      {
        courseware: {
          ...item,
          url: undefined,
          downloadUrl: `/api/courses/${courseId}/courseware/${item.id}/download`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create courseware:", error);
    return NextResponse.json({ error: "Failed to create courseware" }, { status: 500 });
  }
}
