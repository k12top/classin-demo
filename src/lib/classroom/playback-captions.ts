export type TimedRecording = {
  id: string;
  startedAt: string | null;
  stoppedAt: string | null;
};

export type CaptionPosition = {
  recordingId: string;
  seconds: number;
};

/** Never show a previous lesson's transcript while another lesson is loading. */
export function captionDataForSession<T>(data: {sessionId:string;items:T[];cursor:string|null}, sessionId:string) {
  return sessionId && data.sessionId === sessionId ? data : null;
}

/** Replay an utterance with enough lead-in to hear the preceding context. */
export function captionSeekPosition(position: CaptionPosition): CaptionPosition {
  return { ...position, seconds: Math.max(0, position.seconds - 3) };
}

/** A caption timestamp is wall-clock time, not a media currentTime. */
export function captionPosition(
  occurredAt: string,
  recordings: readonly TimedRecording[],
  preferredRecordingId?: string | null,
): CaptionPosition | null {
  const timestamp = Date.parse(occurredAt);
  if (!Number.isFinite(timestamp)) return null;
  const preferred=preferredRecordingId?recordings.find(recording=>recording.id===preferredRecordingId):undefined;
  const candidates=preferred?[preferred,...recordings.filter(recording=>recording.id!==preferred.id)]:recordings;
  let endpoint:CaptionPosition|null=null;
  for (const recording of candidates) {
    if (!recording.startedAt || !recording.stoppedAt) continue;
    const startedAt = Date.parse(recording.startedAt);
    const stoppedAt = Date.parse(recording.stoppedAt);
    if (
      !Number.isFinite(startedAt) || !Number.isFinite(stoppedAt) ||
      stoppedAt <= startedAt || timestamp < startedAt || timestamp > stoppedAt
    ) continue;
    const position={ recordingId: recording.id, seconds: (timestamp - startedAt) / 1000 };
    // Shared boundaries belong to the next clip. Keep the old endpoint only
    // when no clip contains this time (including the final replay endpoint).
    if(timestamp===stoppedAt){endpoint??=position;continue;}
    return position;
  }
  return endpoint;
}

export function activeCaptionIndex(
  captions: readonly { occurredAt: string }[],
  recording: TimedRecording | null,
  mediaTime: number,
): number {
  if (!recording?.startedAt || !Number.isFinite(mediaTime)) return -1;
  const start = Date.parse(recording.startedAt);
  if (!Number.isFinite(start)) return -1;
  const end=recording.stoppedAt?Date.parse(recording.stoppedAt):Infinity;
  if(Number.isNaN(end)||end<=start)return -1;
  const current = Math.min(start + mediaTime * 1000,end);
  let active = -1;
  for (let index = 0; index < captions.length; index += 1) {
    const caption = captions[index];
    if (!caption) continue;
    const position = Date.parse(caption.occurredAt);
    if (position > current || position >= end) break;
    if (position >= start) active = index;
  }
  return active;
}
