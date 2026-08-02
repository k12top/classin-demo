import { NextRequest, NextResponse } from "next/server";
import {
  CoursewareStorageConfigurationError,
  getCoursewareOssClient,
} from "@/lib/aliyun-oss";
import { resolveCoursewareAccess } from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: Promise<{ sessionId: string; recordingId: string }>;
};

export async function GET(request: NextRequest, context: Context) {
  const identity = await getSessionFromRequest(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { sessionId, recordingId } = await context.params;
  const recording = await prisma.classroomRecording.findFirst({
    where: {
      id: recordingId,
      sessionId,
      status: "completed",
      playbackObjectKey: { not: null },
    },
    select: {
      courseId: true,
      playbackObjectKey: true,
      playbackFormat: true,
    },
  });
  if (!recording?.playbackObjectKey) {
    return NextResponse.json({ error: "Recording is not ready" }, { status: 404 });
  }
  const access = await resolveCoursewareAccess(
    identity,
    recording.courseId,
    sessionId,
  );
  if (!access.allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const hls = recording.playbackFormat === "hls";
    const url = getCoursewareOssClient().signatureUrl(
      recording.playbackObjectKey,
      {
        expires: 60 * 60,
        response: {
          "content-type": hls
            ? "application/vnd.apple.mpegurl"
            : "video/mp4",
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
