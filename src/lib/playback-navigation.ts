type PlaybackScroller = {
  scrollIntoView(options: ScrollIntoViewOptions): void;
};

type SeekableVideo = {
  currentTime: number;
  duration: number;
  play(): Promise<void>;
};

type PlayableVideo = Pick<SeekableVideo, "play">;

export type PlaybackBufferingEvent =
  | "loadstart"
  | "waiting"
  | "seeking"
  | "loadeddata"
  | "canplay"
  | "playing"
  | "pause"
  | "ended"
  | "error";

export function playbackBufferingState(
  current: boolean,
  event: PlaybackBufferingEvent,
  paused: boolean
): boolean {
  if (event === "loadstart") return true;
  if (event === "waiting" || event === "seeking") return !paused;
  if (event === "loadeddata") return paused ? false : current;
  if (["canplay", "playing", "pause", "ended", "error"].includes(event)) return false;
  return current;
}

export function updatePlaybackBuffering(
  setState: (update: (current: boolean) => boolean) => void,
  event: PlaybackBufferingEvent,
  media: { paused: boolean }
): void {
  const paused = media.paused;
  setState((current) => playbackBufferingState(current, event, paused));
}

export function requestPlayback(video: PlayableVideo | null): void {
  if (!video) return;
  void video.play().catch(() => undefined);
}

export function scrollToPlayback(player: PlaybackScroller | null): void {
  player?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export async function applyPlaybackSeek(
  video: SeekableVideo,
  seconds: number
): Promise<number> {
  const maxTime = Number.isFinite(video.duration)
    ? Math.max(0, video.duration - 0.1)
    : seconds;
  const position = Math.min(seconds, maxTime);
  video.currentTime = position;
  await video.play().catch(() => undefined);
  return position;
}
