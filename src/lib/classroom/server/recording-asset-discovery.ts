import "server-only";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { getCoursewareOssClient } from "@/lib/aliyun-oss";
import { prisma } from "@/lib/db";
import { recordingAssetDiscoveryDue, RECORDING_ASSET_CHECK_INTERVAL_MS } from "@/lib/classroom/recording-asset-discovery";
import { recordingPlaybackAssets } from "@/lib/classroom/recording-playback";

/** Storage discovery is separate from provider-stop verification, including exhausted stop tasks. */
export async function discoverRecordingPlaybackAssets(recordingId: string): Promise<boolean> {
  const recording = await prisma.classroomRecording.findUnique({ where: { id: recordingId } });
  const checkedAt = new Date();
  if (!recording || !recordingAssetDiscoveryDue(recording, checkedAt.getTime())) return false;
  const state = recording.providerState;
  const segments = state && typeof state === "object" && !Array.isArray(state) && Array.isArray(state.fileNamePrefix)
    ? state.fileNamePrefix.filter((part): part is string => typeof part === "string" && Boolean(part)) : [];
  const fallbackPrefix = recording.provider === "agora" && recording.sessionId
    ? `${(process.env.AGORA_RECORDING_PREFIX || "recordings").trim().replace(/^\/+|\/+$/g, "")}/${recording.sessionId}/${recording.id}` : "";
  const directory = recording.playbackObjectKey ? path.posix.dirname(recording.playbackObjectKey)
    : segments.length >= 3 ? segments.join("/") : fallbackPrefix;
  if (!directory || directory.startsWith("/") || directory.split("/").some(part => !part || part === ".." || part === ".")) return false;
  const prefix = `${directory}/`;
  // Reuse the existing check timestamp as a lease; concurrent readers list once.
  const claimed = await prisma.classroomRecording.updateMany({
    where: {
      id: recordingId, status: recording.status, playbackFormat: recording.playbackFormat,
      playbackObjectKey: recording.playbackObjectKey,
      OR: [{ lastProviderCheckAt: null }, { lastProviderCheckAt: { lte: new Date(checkedAt.getTime() - RECORDING_ASSET_CHECK_INTERVAL_MS) } }],
    },
    data: { lastProviderCheckAt: checkedAt },
  });
  if (!claimed.count) return false;

  const client = getCoursewareOssClient();
  const media = new Set<string>();
  let marker: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await client.list({ prefix, marker, "max-keys": 1_000 }, {});
    for (const object of result.objects || []) {
      if (object.name.startsWith(prefix) && /\.(mp4|m3u8)$/i.test(object.name) && object.size > 0) media.add(object.name);
    }
    if (!result.nextMarker) break;
    if (result.nextMarker === marker || page === 19) throw new Error("Recording asset listing exceeded its page limit");
    marker = result.nextMarker;
  }
  if (!media.size) return false;
  const files = [
    ...(Array.isArray(recording.files) ? recording.files : []),
    ...[...media].map((fileName) => ({ fileName, isPlayable: true })),
  ];
  const selected = recordingPlaybackAssets(files, [], recording.playbackObjectKey, recording.playbackFormat)[0];
  if (!selected) return false;
  const updated = await prisma.classroomRecording.updateMany({
    where: { id: recordingId, status: recording.status, playbackObjectKey: recording.playbackObjectKey, lastProviderCheckAt: checkedAt },
    data: {
      files: files as Prisma.InputJsonValue,
      playbackObjectKey: selected.objectKey,
      playbackFormat: selected.format,
    },
  });
  return updated.count > 0;
}
