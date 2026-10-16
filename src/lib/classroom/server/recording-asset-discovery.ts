import "server-only";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { getCoursewareOssClient } from "@/lib/aliyun-oss";
import { prisma } from "@/lib/db";
import { recordingAssetDiscoveryDue, RECORDING_ASSET_CHECK_INTERVAL_MS } from "@/lib/classroom/recording-asset-discovery";
import { recordingPlaybackAssets } from "@/lib/classroom/recording-playback";

/** An HLS playlist may finalize before its MP4, after normal reconciliation stops. */
export async function discoverRecordingPlaybackAssets(recordingId: string): Promise<boolean> {
  const recording = await prisma.classroomRecording.findUnique({ where: { id: recordingId } });
  const checkedAt = new Date();
  if (!recording || !recordingAssetDiscoveryDue(recording, checkedAt.getTime()) || !recording.playbackObjectKey) return false;
  const directory = path.posix.dirname(recording.playbackObjectKey);
  if (directory === "." || directory === "/" || directory.split("/").includes("..")) return false;
  const prefix = `${directory}/`;
  // Reuse the existing check timestamp as a lease; concurrent readers list once.
  const claimed = await prisma.classroomRecording.updateMany({
    where: {
      id: recordingId, status: "completed", playbackFormat: "hls",
      playbackObjectKey: recording.playbackObjectKey,
      OR: [{ lastProviderCheckAt: null }, { lastProviderCheckAt: { lte: new Date(checkedAt.getTime() - RECORDING_ASSET_CHECK_INTERVAL_MS) } }],
    },
    data: { lastProviderCheckAt: checkedAt },
  });
  if (!claimed.count) return false;

  const client = getCoursewareOssClient();
  const mp4s = new Set<string>();
  let marker: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await client.list({ prefix, marker, "max-keys": 1_000 }, {});
    for (const object of result.objects || []) {
      if (object.name.startsWith(prefix) && object.name.toLowerCase().endsWith(".mp4") && object.size > 0) mp4s.add(object.name);
    }
    if (!result.nextMarker) break;
    if (result.nextMarker === marker || page === 19) throw new Error("Recording asset listing exceeded its page limit");
    marker = result.nextMarker;
  }
  if (!mp4s.size) return false;
  const files = [
    ...(Array.isArray(recording.files) ? recording.files : []),
    ...[...mp4s].map((fileName) => ({ fileName, isPlayable: true })),
  ];
  const selected = recordingPlaybackAssets(files, [], recording.playbackObjectKey, recording.playbackFormat)[0];
  if (selected?.format !== "mp4") return false;
  const updated = await prisma.classroomRecording.updateMany({
    where: { id: recordingId, status: "completed", playbackFormat: "hls", lastProviderCheckAt: checkedAt },
    data: {
      files: files as Prisma.InputJsonValue,
      playbackObjectKey: selected.objectKey,
      playbackFormat: "mp4",
    },
  });
  return updated.count > 0;
}
