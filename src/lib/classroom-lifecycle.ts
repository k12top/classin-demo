const DEFAULT_CLASSROOM_DURATION_SECONDS = 30 * 60;
const MIN_CLASSROOM_DURATION_SECONDS = 60;
const MAX_CLASSROOM_DURATION_SECONDS = 24 * 60 * 60;
const CLASSROOM_OVERTIME_ALLOWANCE_SECONDS = 20 * 60;

type CourseTime = Date | string | null | undefined;

export type ClassroomLaunchSchedule = {
  startTimeMs: number;
  durationSeconds: number;
};

function toValidDate(value: CourseTime): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Keep the Agora room timer aligned with the configured course end time plus
 * the maximum 20-minute overtime allowance.
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
    (end.getTime() + CLASSROOM_OVERTIME_ALLOWANCE_SECONDS * 1000 -
      now.getTime()) /
      1000,
  );
  return Math.max(MIN_CLASSROOM_DURATION_SECONDS, remainingSeconds);
}

/**
 * Build the immutable schedule Agora stores when the first user creates a
 * room. When both course times are valid, duration must be the full interval
 * from the configured start through end time plus the 20-minute overtime
 * allowance — not the remaining time when a user happens to enter.
 */
export function classroomLaunchSchedule(
  startTime: CourseTime,
  endTime: CourseTime,
  now: Date = new Date(),
): ClassroomLaunchSchedule {
  const validNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const start = toValidDate(startTime) ?? validNow;
  const end = toValidDate(endTime);

  const configuredDurationSeconds =
    end && end.getTime() > start.getTime()
      ? Math.ceil(
          (end.getTime() - start.getTime()) / 1000 +
            CLASSROOM_OVERTIME_ALLOWANCE_SECONDS,
        )
      : DEFAULT_CLASSROOM_DURATION_SECONDS;

  return {
    startTimeMs: start.getTime(),
    durationSeconds: Math.min(
      MAX_CLASSROOM_DURATION_SECONDS,
      Math.max(MIN_CLASSROOM_DURATION_SECONDS, configuredDurationSeconds),
    ),
  };
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
  maximumDurationSeconds: MAX_CLASSROOM_DURATION_SECONDS,
  overtimeAllowanceSeconds: CLASSROOM_OVERTIME_ALLOWANCE_SECONDS,
} as const;
