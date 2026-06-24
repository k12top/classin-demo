export const CourseStatus = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  AFTER_CLASS: "afterClass",
  FINISHED: "finished",
  CANCELLED: "cancelled",
} as const;

export type CourseStatusValue =
  (typeof CourseStatus)[keyof typeof CourseStatus];

export const COURSE_STATUSES: CourseStatusValue[] = [
  CourseStatus.SCHEDULED,
  CourseStatus.LIVE,
  CourseStatus.AFTER_CLASS,
  CourseStatus.FINISHED,
  CourseStatus.CANCELLED,
];

export function getFinishedDelayMinutes(): number {
  const raw = process.env.COURSE_FINISHED_DELAY_MINUTES;
  if (raw === undefined || raw === "") return 20;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

export function getEarlyClassroomEntryMinutes(): number {
  const raw = process.env.COURSE_EARLY_ENTRY_MINUTES;
  if (raw === undefined || raw === "") return 20;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

export function isValidCourseStatus(value: string): value is CourseStatusValue {
  return (COURSE_STATUSES as string[]).includes(value);
}

export function statusLabel(status: string): string {
  switch (status) {
    case CourseStatus.SCHEDULED:
      return "未开始";
    case CourseStatus.LIVE:
      return "进行中";
    case CourseStatus.AFTER_CLASS:
      return "已下课";
    case CourseStatus.FINISHED:
      return "已结束";
    case CourseStatus.CANCELLED:
      return "已取消";
    default:
      return status;
  }
}

export function statusBadgeClassName(status: string): string {
  switch (status) {
    case CourseStatus.SCHEDULED:
      return "border-green-500/50 text-green-400 bg-green-500/10";
    case CourseStatus.LIVE:
      return "border-amber-500/50 text-amber-300 bg-amber-500/10 animate-pulse";
    case CourseStatus.AFTER_CLASS:
      return "border-blue-500/50 text-blue-300 bg-blue-500/10";
    case CourseStatus.FINISHED:
      return "border-gray-500/50 text-gray-400 bg-gray-500/10";
    case CourseStatus.CANCELLED:
      return "border-red-500/50 text-red-400 bg-red-500/10";
    default:
      return "border-white/20 text-white/60 bg-white/5";
  }
}

export function canEnterClassroom(status: string): boolean {
  return (
    status === CourseStatus.SCHEDULED ||
    status === CourseStatus.LIVE ||
    status === CourseStatus.AFTER_CLASS
  );
}

export function isTooEarlyToEnterClassroom(
  startTime: Date | string | null | undefined,
  now: Date = new Date(),
  earlyMinutes = getEarlyClassroomEntryMinutes()
): boolean {
  if (!startTime) return false;
  const start = startTime instanceof Date ? startTime : new Date(startTime);
  if (Number.isNaN(start.getTime())) return false;
  return now.getTime() < start.getTime() - earlyMinutes * 60 * 1000;
}

export function courseNotStartedReason(
  earlyMinutes = getEarlyClassroomEntryMinutes()
): string {
  return `课程还未开启，可以在课前${earlyMinutes}分钟进入`;
}

export function isUpcomingStatus(status: string): boolean {
  return (
    status === CourseStatus.SCHEDULED ||
    status === CourseStatus.LIVE ||
    status === CourseStatus.AFTER_CLASS
  );
}

export function isFinishedDue(
  endedAt: Date | null | undefined,
  now: Date = new Date(),
  delayMinutes = getFinishedDelayMinutes()
): boolean {
  if (!endedAt) return false;
  return now.getTime() >= endedAt.getTime() + delayMinutes * 60 * 1000;
}

/** Agora ClassState: 0=beforeClass, 1=ongoing, 2=afterClass, 3=close */
export function mapAgoraClassStateToCourseStatus(
  classState: number
): CourseStatusValue | null {
  switch (classState) {
    case 1:
      return CourseStatus.LIVE;
    case 2:
      return CourseStatus.AFTER_CLASS;
    default:
      return null;
  }
}

export function parseCourseStatusFilter(
  raw: string | null
): CourseStatusValue | null | { error: string } {
  if (raw === null || raw === "") {
    return null;
  }
  if (raw === "active") {
    return {
      error: "status 'active' is deprecated; use 'scheduled'",
    };
  }
  if (!isValidCourseStatus(raw)) {
    return {
      error: `status must be one of: ${COURSE_STATUSES.join(", ")}`,
    };
  }
  return raw;
}

export function canApplyStatusFromAgora(
  currentStatus: string,
  nextStatus: CourseStatusValue
): boolean {
  if (
    currentStatus === CourseStatus.CANCELLED ||
    currentStatus === CourseStatus.FINISHED
  ) {
    return false;
  }
  if (nextStatus === CourseStatus.LIVE) {
    return currentStatus === CourseStatus.SCHEDULED;
  }
  if (nextStatus === CourseStatus.AFTER_CLASS) {
    return (
      currentStatus === CourseStatus.SCHEDULED ||
      currentStatus === CourseStatus.LIVE
    );
  }
  return false;
}

/** Teacher manual finish: respect delay unless force. */
export function resolveManualFinishedStatus(
  currentStatus: string,
  endedAt: Date | null | undefined,
  force: boolean
): CourseStatusValue | null {
  if (currentStatus === CourseStatus.CANCELLED) return null;
  if (currentStatus === CourseStatus.FINISHED) return CourseStatus.FINISHED;
  if (force || isFinishedDue(endedAt)) {
    return CourseStatus.FINISHED;
  }
  return CourseStatus.AFTER_CLASS;
}
