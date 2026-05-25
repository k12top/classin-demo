import { CourseStatus, getFinishedDelayMinutes } from "@/lib/course-status";
import { prisma } from "@/lib/db";

/** Promote afterClass courses whose endedAt + delay has passed to finished. */
export async function promoteCoursesIfDue(
  courseIds?: string[]
): Promise<number> {
  const delayMinutes = getFinishedDelayMinutes();
  const threshold = new Date(Date.now() - delayMinutes * 60 * 1000);

  const result = await prisma.course.updateMany({
    where: {
      status: CourseStatus.AFTER_CLASS,
      endedAt: { not: null, lte: threshold },
      ...(courseIds?.length ? { id: { in: courseIds } } : {}),
    },
    data: { status: CourseStatus.FINISHED },
  });

  return result.count;
}

export async function promoteCourseIfDueById(courseId: string) {
  await promoteCoursesIfDue([courseId]);
  return prisma.course.findUnique({ where: { id: courseId } });
}
