import { statusLabel } from "@/lib/course-status";

type CourseLike = Record<string, unknown> & { status: string };

export function serializeCourse<T extends CourseLike>(
  course: T
): T & { statusLabel: string } {
  return {
    ...course,
    statusLabel: statusLabel(course.status),
  };
}

export function serializeCourses<T extends CourseLike>(
  courses: T[]
): (T & { statusLabel: string })[] {
  return courses.map(serializeCourse);
}
