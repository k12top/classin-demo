const DEFAULT_CLASSROOM_DURATION_SECONDS = 30 * 60;
const MIN_CLASSROOM_DURATION_SECONDS = 60;

type CourseTime = Date | string | null | undefined;

function toValidDate(value: CourseTime): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Keep the Agora room timer aligned with the configured course end time.
 * Legacy courses without a valid end time retain the previous 30-minute
 * fallback instead of receiving an unbounded room.
 */
export function classroomDurationSeconds(
  endTime: CourseTime,
  now: Date = new Date(),
): number {
  const end = toValidDate(endTime);
  if (!end || Number.isNaN(now.getTime())) {
    return DEFAULT_CLASSROOM_DURATION_SECONDS;
  }

  const remainingSeconds = Math.ceil(
    (end.getTime() - now.getTime()) / 1000,
  );
  return Math.max(MIN_CLASSROOM_DURATION_SECONDS, remainingSeconds);
}

/**
 * Agora may emit afterClass when a teacher leaves or its own room timer ends.
 * The platform schedule remains authoritative until the configured end time.
 */
export function canSyncAgoraAfterClass(
  endTime: CourseTime,
  now: Date = new Date(),
): boolean {
  const end = toValidDate(endTime);
  if (!end || Number.isNaN(now.getTime())) return true;
  return now.getTime() >= end.getTime();
}

export const classroomLifecycleDefaults = {
  durationSeconds: DEFAULT_CLASSROOM_DURATION_SECONDS,
  minimumDurationSeconds: MIN_CLASSROOM_DURATION_SECONDS,
} as const;
