export type RecordingPlaybackAsset = {
  objectKey: string;
  format: "mp4" | "hls";
};

export type RecordingReplayState = {
  status: string;
  stopRequestedAt?: Date | null;
  stoppedAt?: Date | null;
  playbackObjectKey: string | null;
  playbackFormat: string | null;
  files?: unknown;
  providerState?: unknown;
};

/** Replay availability is independent of whether the recorder's exit was confirmed. */
export function recordingReplayAssets(recording: RecordingReplayState): RecordingPlaybackAsset[] {
  if (recording.status !== "completed" && !(
    ["stopping", "processing", "failed"].includes(recording.status) &&
    (recording.stopRequestedAt || recording.stoppedAt)
  )) return [];
  const state = recording.providerState;
  const prefix = state && typeof state === "object" && !Array.isArray(state) &&
    "fileNamePrefix" in state && Array.isArray(state.fileNamePrefix)
    ? state.fileNamePrefix.filter((part): part is string => typeof part === "string") : [];
  return recordingPlaybackAssets(recording.files, prefix, recording.playbackObjectKey, recording.playbackFormat);
}

/** Prefer complete MP4 clips; an HLS playlist already contains its media chunks. */
export function recordingPlaybackAssets(
  files: unknown,
  prefixSegments: readonly string[],
  fallbackKey?: string | null,
  fallbackFormat?: string | null,
): RecordingPlaybackAsset[] {
  const prefix = prefixSegments.filter(Boolean).join("/");
  const assets: RecordingPlaybackAsset[] = (Array.isArray(files) ? files : []).flatMap((value): RecordingPlaybackAsset[] => {
    if (!value || typeof value !== "object") return [];
    const file = value as { fileName?: unknown; filename?: unknown; isPlayable?: unknown };
    if (file.isPlayable === false) return [];
    const name = file.fileName || file.filename;
    if (typeof name !== "string") return [];
    const trimmed = name.trim().replace(/^\/+/, "");
    if (!trimmed || trimmed.split("/").some((part) => part === ".." || part === ".")) return [];
    const format = trimmed.toLowerCase().endsWith(".mp4") ? "mp4"
      : trimmed.toLowerCase().endsWith(".m3u8") ? "hls" : null;
    if (!format) return [];
    const objectKey = prefix && !trimmed.startsWith(`${prefix}/`)
      ? `${prefix}/${trimmed}` : trimmed;
    return [{ objectKey, format }];
  });
  if (fallbackKey && (fallbackFormat === "mp4" || fallbackFormat === "hls")) {
    assets.push({ objectKey: fallbackKey, format: fallbackFormat });
  }
  const unique = [...new Map(assets.map((asset) => [asset.objectKey, asset])).values()];
  const mp4s = unique.filter((asset) => asset.format === "mp4");
  if (mp4s.length) return mp4s.sort((a, b) => a.objectKey.localeCompare(b.objectKey, "en", { numeric: true }));
  return unique.filter((asset) => asset.format === "hls")
    .sort((a, b) => a.objectKey.localeCompare(b.objectKey, "en", { numeric: true }));
}
