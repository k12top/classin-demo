import { NextRequest, NextResponse } from "next/server";
import {
  CoursewareStorageConfigurationError,
  getCoursewareOssClient,
} from "@/lib/aliyun-oss";
import { canAccessCourseware } from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function playbackRedirect(
  request: NextRequest,
  courseId: string,
) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await canAccessCourseware(session, courseId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recording = await prisma.classroomRecording.findFirst({
    where: {
      courseId,
      status: "completed",
      playbackObjectKey: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { playbackObjectKey: true },
  });
  if (!recording?.playbackObjectKey) {
    return NextResponse.json(
      { error: "Recording is not ready" },
      { status: 404 },
    );
  }

  try {
    const url = getCoursewareOssClient().signatureUrl(
      recording.playbackObjectKey,
      {
        expires: 60 * 60,
        response: {
          "content-type": "video/mp4",
          "content-disposition": "inline",
        },
      },
    );
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof CoursewareStorageConfigurationError) {
      return NextResponse.json(
        {
          error: "Playback storage is not configured",
          missingVariables: error.missingVariables,
        },
        { status: 503 },
      );
    }
    console.error("[classroom:recording] playback URL failed", error);
    return NextResponse.json(
      { error: "Failed to create playback URL" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return playbackRedirect(request, id);
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return playbackRedirect(request, id);
}

