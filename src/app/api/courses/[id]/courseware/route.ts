import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  getCoursewareOssClient,
  isCoursewareObjectKey,
  toCoursewareStorageUrl,
} from "@/lib/aliyun-oss";
import { getCoursewareLessons, resolveCoursewareAccess } from "@/lib/courseware-access";
import { assertCanUploadCourseware, COURSEWARE_UPLOAD_FORBIDDEN } from "@/lib/courseware-upload-access";
import { refreshClassroomRedisControl } from "@/lib/classroom/server/redis-sync";
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
  const requestedSessionId = new URL(request.url).searchParams.get("sessionId")?.trim() || null;

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
    const lessons = requestedSessionId || teaching ? [] : access.lessons ?? await getCoursewareLessons(session, courseId);
    const uploadSessions = lessons.filter(lesson => lesson.teaching);

    const teachingFileIds = new Set<string>();
    const teachingRules = new Map<string, { coursewareId: string; action: string }[]>();
    let teachingFilters: Prisma.CoursewareWhereInput[] = [];
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
    if (!requestedSessionId && !teaching) {
      // The library is the union of exposed files, not the entire course's
      // lesson-owned files. Explicit include/exclude rules stay authoritative.
      const visibleLessons = lessons;
      const filters = await Promise.all(visibleLessons.map(async lesson => {
        const rules = await prisma.courseSessionCourseware.findMany({
          where: { sessionId: lesson.id }, select: { coursewareId: true, action: true },
        });
        if (lesson.teaching) teachingRules.set(lesson.id, rules);
        return { OR: [
          { sessionId: null, id: { notIn: rules.filter(rule => rule.action === "exclude").map(rule => rule.coursewareId) } },
          { sessionId: lesson.id },
          { id: { in: rules.filter(rule => rule.action === "include").map(rule => rule.coursewareId) } },
        ] };
      }));
      teachingFilters = filters.filter((_, index) => lessons.find(lesson => lesson.id === visibleLessons[index].id)?.teaching);
      lessonFilter = teaching ? {} : filters.length ? { OR: filters } : { sessionId: null };
    }
    if (!requestedSessionId && teaching) lessonFilter = {};
    const itemWhere: Prisma.CoursewareWhereInput = {
      courseId,
      ...(teaching ? lessonFilter : { OR: [
        { ...lessonFilter, studentCanView: true },
        ...(teachingFilters.length ? [{ OR: teachingFilters }] : []),
      ] }),
    };

    const items = await refreshCoursewareConversions(await prisma.courseware.findMany({
      where: itemWhere,
      orderBy: { createdAt: "desc" },
    }));

    if (!teaching && uploadSessions.length) {
      for (const item of items) {
        if (uploadSessions.some(lesson => {
          if (item.sessionId === lesson.id) return true;
          const rule = teachingRules.get(lesson.id)?.find(rule => rule.coursewareId === item.id);
          return rule ? rule.action === "include" : item.sessionId === null;
        })) teachingFileIds.add(item.id);
      }
    }
    return NextResponse.json(
      {
        uploadSessions,
        courseware: items.map((item) => ({
          ...item,
          url: undefined,
          downloadUrl:
            teaching || teachingFileIds.has(item.id) || item.studentCanDownload
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
    const requestedSessionId = new URL(request.url).searchParams.get("sessionId")?.trim() || null;
    if (
      !(await assertCanUploadCourseware(session, courseId, requestedSessionId))
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
        sessionId: requestedSessionId,
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

    if (requestedSessionId) await refreshClassroomRedisControl(requestedSessionId);

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
