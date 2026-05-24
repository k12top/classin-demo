export const CourseStatus = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
  CANCELLED: "cancelled",
} as const;

export type CourseStatusValue =
  (typeof CourseStatus)[keyof typeof CourseStatus];

export const COURSE_STATUSES: CourseStatusValue[] = [
  CourseStatus.SCHEDULED,
  CourseStatus.LIVE,
  CourseStatus.FINISHED,
  CourseStatus.CANCELLED,
];

export function isValidCourseStatus(value: string): value is CourseStatusValue {
  return (COURSE_STATUSES as string[]).includes(value);
}

export function statusLabel(status: string): string {
  switch (status) {
    case CourseStatus.SCHEDULED:
      return "未开始";
    case CourseStatus.LIVE:
      return "进行中";
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
    status === CourseStatus.SCHEDULED || status === CourseStatus.LIVE
  );
}

export function isUpcomingStatus(status: string): boolean {
  return canEnterClassroom(status);
}

/** Agora ClassState: 0=beforeClass, 1=ongoing, 2=afterClass, 3=close */
export function mapAgoraClassStateToCourseStatus(
  classState: number
): CourseStatusValue | null {
  switch (classState) {
    case 1:
      return CourseStatus.LIVE;
    case 2:
    case 3:
      return CourseStatus.FINISHED;
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
  if (currentStatus === CourseStatus.CANCELLED) {
    return false;
  }
  if (nextStatus === CourseStatus.LIVE) {
    return currentStatus === CourseStatus.SCHEDULED;
  }
  if (nextStatus === CourseStatus.FINISHED) {
    return (
      currentStatus === CourseStatus.SCHEDULED ||
      currentStatus === CourseStatus.LIVE
    );
  }
  return false;
}
