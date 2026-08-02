export const playbackProgressPolicy = {
  heartbeatIntervalMs: 15_000,
  minimumHeartbeatGapMs: 4_000,
  maximumHeartbeatGapMs: 45_000,
  maximumCreditPerHeartbeatSec: 20,
  maximumPlaybackRate: 2,
  minimumPlaybackRate: 0.25,
  activeWindowMs: 45_000,
} as const;

export type PlaybackCreditInput = {
  elapsedMs: number;
  previousPositionSec: number | null;
  currentPositionSec: number;
  playbackRate: number;
  previousState: string;
  activeWindow: boolean;
};

export function isFinitePlaybackPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizePlaybackRate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (
    value < playbackProgressPolicy.minimumPlaybackRate ||
    value > playbackProgressPolicy.maximumPlaybackRate
  ) {
    return null;
  }
  return value;
}

/**
 * Credit is bounded by server wall time and corroborated by media movement.
 * Seeking cannot create credit because a media jump is converted back to wall
 * time and then capped by the elapsed server time and heartbeat ceiling.
 */
export function calculatePlaybackCreditSec(input: PlaybackCreditInput): number {
  if (
    !input.activeWindow ||
    input.previousState !== "playing" ||
    input.previousPositionSec === null ||
    input.elapsedMs < playbackProgressPolicy.minimumHeartbeatGapMs ||
    input.elapsedMs > playbackProgressPolicy.maximumHeartbeatGapMs
  ) {
    return 0;
  }

  const mediaDeltaSec = input.currentPositionSec - input.previousPositionSec;
  if (!Number.isFinite(mediaDeltaSec) || mediaDeltaSec <= 0) return 0;

  const elapsedSec = input.elapsedMs / 1000;
  const mediaWallTimeSec = mediaDeltaSec / input.playbackRate;
  return Math.max(
    0,
    Math.floor(
      Math.min(
        elapsedSec,
        mediaWallTimeSec + 1,
        playbackProgressPolicy.maximumCreditPerHeartbeatSec
      )
    )
  );
}

export function formatPlaybackDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
