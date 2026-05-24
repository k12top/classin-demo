import type { Prisma } from "@prisma/client";

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

/** DB orderBy — default mode uses arbitrary order; ClassIn sort applied in memory. */
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

function compareActive<T extends CourseForListSort>(a: T, b: T): number {
  const aT = timeMs(a.startTime);
  const bT = timeMs(b.startTime);
  if (aT === null && bT === null) return 0;
  if (aT === null) return 1;
  if (bT === null) return -1;
  return aT - bT;
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

/** ClassIn-style: active by startTime asc; finished/cancelled by endTime desc. */
export function sortCoursesClassInStyle<T extends CourseForListSort>(
  courses: T[]
): T[] {
  const active = courses
    .filter((c) => c.status === "active")
    .sort(compareActive);
  const finished = courses
    .filter((c) => c.status === "finished")
    .sort(compareFinishedOrCancelled);
  const cancelled = courses
    .filter((c) => c.status === "cancelled")
    .sort(compareFinishedOrCancelled);
  const other = courses.filter(
    (c) =>
      c.status !== "active" &&
      c.status !== "finished" &&
      c.status !== "cancelled"
  );
  return [...active, ...finished, ...cancelled, ...other];
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
  return sortCoursesClassInStyle(courses);
}
