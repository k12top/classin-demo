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

/** Logical clips retain stable MP4 IDs; an HLS alternative does not create a second clip. */
export function recordingPlaybackAssets(
  files: unknown,
  prefixSegments: readonly string[],
  fallbackKey?: string | null,
  fallbackFormat?: string | null,
): RecordingPlaybackAsset[] {
  const unique = recordingMediaAssets(files, prefixSegments, fallbackKey, fallbackFormat);
  const mp4s = unique.filter((asset) => asset.format === "mp4");
  if (mp4s.length) return mp4s.sort((a, b) => a.objectKey.localeCompare(b.objectKey, "en", { numeric: true }));
  return unique.filter((asset) => asset.format === "hls")
    .sort((a, b) => a.objectKey.localeCompare(b.objectKey, "en", { numeric: true }));
}

function recordingMediaAssets(files: unknown, prefixSegments: readonly string[], fallbackKey?: string | null, fallbackFormat?: string | null) {
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
  return [...new Map(assets.map((asset) => [asset.objectKey, asset])).values()];
}

/** Pair only an unambiguous single MP4/HLS recording. Multi-file clips keep their boundaries. */
export function recordingHlsAlternative(recording: RecordingReplayState, asset: RecordingPlaybackAsset): string | null {
  if (asset.format !== "mp4") return null;
  const state = recording.providerState && typeof recording.providerState === "object" ? recording.providerState as Record<string, unknown> : {};
  const edit = state.playbackEdit;
  if (edit && typeof edit === "object") {
    // An edited MP4 must never silently revert to the unedited provider playlist.
    const metadata = edit as Record<string, unknown>;
    const key = metadata.hlsObjectKey;
    const editedKey = metadata.editedObjectKey;
    // Derived files stay outside the provider prefix so future discovery cannot
    // mistake an fMP4 initialization object for another recorded clip.
    const directory = typeof editedKey === "string" && editedKey.startsWith("recording-edits/") &&
      !editedKey.split("/").some(part => part === "." || part === "..")
      ? editedKey.slice(0, editedKey.lastIndexOf("/") + 1) : "";
    return asset.objectKey === recording.playbackObjectKey && typeof key === "string" && directory &&
      key.startsWith(directory) && key.endsWith(".m3u8") && !key.split("/").some(part => part === "." || part === "..") ? key : null;
  }
  const prefix = Array.isArray(state.fileNamePrefix) ? state.fileNamePrefix.filter((part): part is string => typeof part === "string") : [];
  const all = recordingMediaAssets(recording.files, prefix, recording.playbackObjectKey, recording.playbackFormat);
  const mp4s = all.filter(item => item.format === "mp4"), playlists = all.filter(item => item.format === "hls");
  if (mp4s.length !== 1 || playlists.length !== 1) return null;
  const stem = (key: string) => key.replace(/\.(?:mp4|m3u8)$/i, "").replace(/_0$/, "");
  return stem(asset.objectKey) === stem(playlists[0].objectKey) ? playlists[0].objectKey : null;
}
