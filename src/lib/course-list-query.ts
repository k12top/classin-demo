import type { Prisma } from "@prisma/client";

export type CourseListSort =
  | { mode: "startTime" }
  | { mode: "createdAt"; direction: "asc" | "desc" };

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

export function courseListOrderBy(
  sort: CourseListSort
): Prisma.CourseOrderByWithRelationInput {
  if (sort.mode === "startTime") {
    return { startTime: "desc" };
  }
  return { createdAt: sort.direction };
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
