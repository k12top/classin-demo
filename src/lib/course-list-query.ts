import type { Prisma } from "@prisma/client";
import {
  CourseStatus,
  parseCourseStatusFilter,
  type CourseStatusValue,
} from "@/lib/course-status";

export type CourseListSort =
  | { mode: "startTime" }
  | { mode: "createdAt"; direction: "asc" | "desc" };

export type CourseForListSort = {
  status: string;
  startTime: Date | null;
  endTime: Date | null;
  createdAt: Date;
};

export function parseCourseListSort(
  searchParams: URLSearchParams
): CourseListSort | { error: string } {
  const raw = searchParams.get("createdAt");
  if (raw === null || raw === "") {
    return { mode: "startTime" };
  }
  if (raw === "asc" || raw === "desc") {
    return { mode: "createdAt", direction: raw };
  }
  return { error: "createdAt must be asc or desc" };
}

export { parseCourseStatusFilter };

/** DB orderBy — default mode uses arbitrary order; display sort is applied in memory. */
export function courseListOrderBy(
  sort: CourseListSort
): Prisma.CourseOrderByWithRelationInput {
  if (sort.mode === "startTime") {
    return { createdAt: "desc" };
  }
  return { createdAt: sort.direction };
}

function timeMs(d: Date | null | undefined): number | null {
  if (!d) return null;
  return d.getTime();
}

function compareByStartTimeAsc<T extends CourseForListSort>(a: T, b: T): number {
  const aT = timeMs(a.startTime);
  const bT = timeMs(b.startTime);
  if (aT === null && bT === null) return 0;
  if (aT === null) return 1;
  if (bT === null) return -1;
  return aT - bT;
}

function compareUpcoming<T extends CourseForListSort>(a: T, b: T): number {
  const rank = (s: string) => {
    if (s === CourseStatus.LIVE) return 0;
    if (s === CourseStatus.AFTER_CLASS) return 1;
    return 2;
  };
  const rankDiff = rank(a.status) - rank(b.status);
  if (rankDiff !== 0) return rankDiff;
  return compareByStartTimeAsc(a, b);
}

function compareFinishedOrCancelled<T extends CourseForListSort>(
  a: T,
  b: T
): number {
  const aEnd = timeMs(a.endTime);
  const bEnd = timeMs(b.endTime);
  if (aEnd !== null && bEnd !== null) return bEnd - aEnd;
  if (aEnd !== null) return -1;
  if (bEnd !== null) return 1;
  const aStart = timeMs(a.startTime);
  const bStart = timeMs(b.startTime);
  if (aStart === null && bStart === null) return 0;
  if (aStart === null) return 1;
  if (bStart === null) return -1;
  return bStart - aStart;
}

const UPCOMING_STATUSES = new Set<string>([
  CourseStatus.SCHEDULED,
  CourseStatus.LIVE,
  CourseStatus.AFTER_CLASS,
]);

/** Display sort: scheduled+live+afterClass by startTime asc; finished/cancelled by endTime desc. */
export function sortCoursesDisplayStyle<T extends CourseForListSort>(
  courses: T[]
): T[] {
  const upcoming = courses
    .filter((c) => UPCOMING_STATUSES.has(c.status))
    .sort(compareUpcoming);
  const finished = courses
    .filter((c) => c.status === CourseStatus.FINISHED)
    .sort(compareFinishedOrCancelled);
  const cancelled = courses
    .filter((c) => c.status === CourseStatus.CANCELLED)
    .sort(compareFinishedOrCancelled);
  const other = courses.filter(
    (c) =>
      !UPCOMING_STATUSES.has(c.status) &&
      c.status !== CourseStatus.FINISHED &&
      c.status !== CourseStatus.CANCELLED
  );
  return [...upcoming, ...finished, ...cancelled, ...other];
}

export function sortCoursesByCreatedAt<T extends { createdAt: Date }>(
  courses: T[],
  direction: "asc" | "desc"
): T[] {
  return [...courses].sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    return direction === "asc" ? diff : -diff;
  });
}

export function applyCourseListSort<T extends CourseForListSort>(
  courses: T[],
  sort: CourseListSort
): T[] {
  if (sort.mode === "createdAt") {
    return sortCoursesByCreatedAt(courses, sort.direction);
  }
  return sortCoursesDisplayStyle(courses);
}

export function courseListStatusWhere(
  status: CourseStatusValue | null
): Prisma.CourseWhereInput | undefined {
  if (!status) return undefined;
  return { status };
}
