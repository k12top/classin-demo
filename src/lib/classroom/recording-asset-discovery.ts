import { recordingPlaybackAssets } from "./recording-playback";

export const RECORDING_ASSET_CHECK_INTERVAL_MS = 60_000;
const MP4_FINALIZATION_WINDOW_MS = 15 * 60_000;

type RecordingAssetState = {
  status: string;
  playbackFormat: string | null;
  playbackObjectKey: string | null;
  files?: unknown;
  lastProviderCheckAt: Date | null;
  stoppedAt: Date | null;
};

function missingMp4(recording: RecordingAssetState): boolean {
  return recording.status === "completed" && recording.playbackFormat === "hls" &&
    Boolean(recording.playbackObjectKey) &&
    !recordingPlaybackAssets(recording.files, [], recording.playbackObjectKey, recording.playbackFormat)
      .some((asset) => asset.format === "mp4");
}

export function recordingAssetDiscoveryDue(recording: RecordingAssetState, now = Date.now()): boolean {
  return missingMp4(recording) && (!recording.lastProviderCheckAt ||
    now - recording.lastProviderCheckAt.getTime() >= RECORDING_ASSET_CHECK_INTERVAL_MS);
}

/** Poll briefly for late uploads; historical HLS-only lessons do not poll forever. */
export function recordingAssetDiscoveryPollMs(recording: RecordingAssetState, now = Date.now()): number | null {
  if (!missingMp4(recording)) return null;
  if (recordingAssetDiscoveryDue(recording, now)) return 5_000;
  return recording.stoppedAt && now - recording.stoppedAt.getTime() < MP4_FINALIZATION_WINDOW_MS
    ? RECORDING_ASSET_CHECK_INTERVAL_MS : null;
}
