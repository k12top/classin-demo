import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import {
  CoursewareStorageConfigurationError,
  getCoursewareOssClient,
} from "@/lib/aliyun-oss";
import { resolveCoursewareAccess } from "@/lib/courseware-access";
import { prisma } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";
import { recordingReplayAssets } from "@/lib/classroom/recording-playback";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = {
  params: Promise<{ sessionId: string; recordingId: string }>;
};

function recordingAssetContentType(objectKey: string) {
  const extension = path.posix.extname(objectKey).toLowerCase();
  if (extension === ".m3u8") return "application/vnd.apple.mpegurl";
  if (extension === ".ts") return "video/mp2t";
  if (extension === ".m4s") return "video/iso.segment";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".aac") return "audio/aac";
  if (extension === ".key") return "application/octet-stream";
  return "application/octet-stream";
}

function resolveRecordingAsset(
  manifestKey: string,
  requestedAsset: string | null,
) {
  if (!requestedAsset) return manifestKey;
  const normalized = path.posix.normalize(requestedAsset.replace(/^\/+/, ""));
  const recordingPrefix = `${path.posix.dirname(manifestKey)}/`;
  return normalized.startsWith(recordingPrefix) ? normalized : null;
}

function proxiedAssetUrl(request: NextRequest, objectKey: string) {
  const url = new URL(request.url);
  url.searchParams.set("hlsAsset", objectKey);
  return `${url.pathname}${url.search}`;
}

function rewriteHlsManifest(
  request: NextRequest,
  manifestKey: string,
  manifest: string,
) {
  const manifestDirectory = path.posix.dirname(manifestKey);
  const rewriteReference = (reference: string) => {
    const trimmed = reference.trim();
    if (
      !trimmed ||
      trimmed.startsWith("data:") ||
      /^https?:\/\//i.test(trimmed)
    ) {
      return reference;
    }
    const objectKey = path.posix.normalize(
      path.posix.join(manifestDirectory, trimmed),
    );
    return proxiedAssetUrl(request, objectKey);
  };
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line;
      if (!line.startsWith("#")) return rewriteReference(line);
      return line.replace(/URI="([^"]+)"/g, (_match, reference: string) =>
        `URI="${rewriteReference(reference)}"`,
      );
    })
    .join("\n");
}

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
    },
    select: {
      courseId: true,
      playbackObjectKey: true,
      playbackFormat: true,
      files: true,
      providerState: true,
      status: true,
      stopRequestedAt: true,
      stoppedAt: true,
    },
  });
  if (!recording) {
    return NextResponse.json(
      { error: "Recording is not ready" },
      { status: 404 },
    );
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
    const assets = recordingReplayAssets(recording);
    if (!assets.length) return NextResponse.json({ error: "Recording is not ready" }, { status: 404 });
    const requestedAsset = request.nextUrl.searchParams.get("asset");
    const legacyHlsAsset = requestedAsset && recording.playbackObjectKey && recording.playbackFormat === "hls" &&
      !assets.some((asset) => asset.objectKey === requestedAsset) &&
      resolveRecordingAsset(recording.playbackObjectKey, requestedAsset)
      ? requestedAsset : null;
    const selected = requestedAsset
      ? assets.find((asset) => asset.objectKey === requestedAsset) ||
        (legacyHlsAsset && recording.playbackObjectKey ? { objectKey: recording.playbackObjectKey, format: "hls" as const } : null)
      : assets[0];
    if (!selected) {
      return NextResponse.json({ error: "Invalid recording asset" }, { status: 400 });
    }
    const hls = selected.format === "hls";
    if (hls && request.nextUrl.searchParams.get("delivery") === "url") {
      return NextResponse.json({ error: "Direct playback requires an MP4 asset" }, { status: 400 });
    }
    const client = getCoursewareOssClient();
    if (hls) {
      const objectKey = resolveRecordingAsset(
        selected.objectKey,
        request.nextUrl.searchParams.get("hlsAsset") || legacyHlsAsset,
      );
      if (!objectKey) {
        return NextResponse.json(
          { error: "Invalid recording asset" },
          { status: 400 },
        );
      }
      const object = await client.get(objectKey);
      const content = Buffer.isBuffer(object.content)
        ? object.content
        : Buffer.from(object.content);
      if (objectKey.toLowerCase().endsWith(".m3u8")) {
        const manifest = rewriteHlsManifest(
          request,
          objectKey,
          content.toString("utf8"),
        );
        return new NextResponse(manifest, {
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
            "Cache-Control": "private, no-store",
          },
        });
      }
      return new NextResponse(new Uint8Array(content), {
        headers: {
          "Content-Type": recordingAssetContentType(objectKey),
          "Cache-Control": "private, max-age=300",
        },
      });
    }
    const url = client.signatureUrl(selected.objectKey, {
      expires: 60 * 60,
      response: {
        "content-disposition": "inline",
      },
    });
    if (request.nextUrl.searchParams.get("delivery") === "url") {
      return NextResponse.json({ url, format: "mp4" }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
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
