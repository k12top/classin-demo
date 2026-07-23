import { NextRequest, NextResponse } from "next/server";
import {
  createCoursewareObjectKey,
  getCoursewareOssClient,
} from "@/lib/aliyun-oss";
import { assertCanTeachCourse } from "@/lib/course-teacher";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_COURSEWARE_SIZE = 200 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([
  "ppt",
  "pptx",
  "pdf",
  "doc",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "mp3",
  "mp4",
]);

function fileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: courseId } = await params;
  if (session.role !== "teacher" || !(await assertCanTeachCourse(session.userId, courseId))) {
    return NextResponse.json({ error: "Only the teacher can upload courseware" }, { status: 403 });
  }

  const { filename, contentType, size } = await request.json();
  if (typeof filename !== "string" || !filename.trim()) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_COURSEWARE_SIZE) {
    return NextResponse.json({ error: "File size must be between 1 byte and 200 MB" }, { status: 400 });
  }
  if (!SUPPORTED_EXTENSIONS.has(fileExtension(filename))) {
    return NextResponse.json({ error: "Unsupported courseware format" }, { status: 400 });
  }

  try {
    const objectKey = createCoursewareObjectKey(courseId, filename);
    const normalizedContentType =
      typeof contentType === "string" && contentType.trim()
        ? contentType.trim()
        : "application/octet-stream";
    const uploadUrl = getCoursewareOssClient().signatureUrl(objectKey, {
      expires: 15 * 60,
      method: "PUT",
      "Content-Type": normalizedContentType,
    });

    return NextResponse.json({ objectKey, uploadUrl, contentType: normalizedContentType });
  } catch (error) {
    console.error("Failed to create OSS courseware upload URL:", error);
    return NextResponse.json({ error: "Courseware storage is not configured" }, { status: 503 });
  }
}
