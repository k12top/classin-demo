export type TimedRecording = {
  id: string;
  startedAt: string | null;
  stoppedAt: string | null;
};

export type CaptionPosition = {
  recordingId: string;
  seconds: number;
};

/** A caption timestamp is wall-clock time, not a media currentTime. */
export function captionPosition(
  occurredAt: string,
  recordings: readonly TimedRecording[],
): CaptionPosition | null {
  const timestamp = Date.parse(occurredAt);
  if (!Number.isFinite(timestamp)) return null;
  for (const recording of recordings) {
    if (!recording.startedAt || !recording.stoppedAt) continue;
    const startedAt = Date.parse(recording.startedAt);
    const stoppedAt = Date.parse(recording.stoppedAt);
    if (
      !Number.isFinite(startedAt) || !Number.isFinite(stoppedAt) ||
      stoppedAt <= startedAt || timestamp < startedAt || timestamp > stoppedAt
    ) continue;
    return { recordingId: recording.id, seconds: (timestamp - startedAt) / 1000 };
  }
  return null;
}

export function activeCaptionIndex(
  captions: readonly { occurredAt: string }[],
  recording: TimedRecording | null,
  mediaTime: number,
): number {
  if (!recording?.startedAt || !Number.isFinite(mediaTime)) return -1;
  const start = Date.parse(recording.startedAt);
  if (!Number.isFinite(start)) return -1;
  const current = start + mediaTime * 1000;
  let active = -1;
  for (let index = 0; index < captions.length; index += 1) {
    const caption = captions[index];
    if (!caption) continue;
    const position = Date.parse(caption.occurredAt);
    if (position <= current && position >= start) active = index;
    if (position > current) break;
  }
  return active;
}
