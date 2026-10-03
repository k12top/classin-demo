import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  getCoursewareOssClient,
  isCoursewareObjectKey,
  toCoursewareStorageUrl,
} from "@/lib/aliyun-oss";
import { canAccessCourseware } from "@/lib/courseware-access";
import { assertCanTeachCourse } from "@/lib/course-teacher";

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

  try {
    if (!(await canAccessCourseware(session, courseId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const items = await prisma.courseware.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      {
        courseware: items.map((item) => ({
          ...item,
          url: undefined,
          downloadUrl: `/api/courses/${courseId}/courseware/${item.id}/download`,
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
      session.role !== "teacher" ||
      !(await assertCanTeachCourse(session.userId, courseId))
    ) {
      return NextResponse.json({ error: "Only the teacher can upload courseware" }, { status: 403 });
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
