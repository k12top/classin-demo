import { CourseStatus, getFinishedDelayMinutes } from "@/lib/course-status";
import { prisma } from "@/lib/db";

/** Promote afterClass courses whose endedAt + delay has passed to finished. */
export async function promoteCoursesIfDue(
  courseIds?: string[]
): Promise<number> {
  // 1. Promote afterClass courses whose endedAt + delay has passed
  const delayMinutes = getFinishedDelayMinutes();
  const threshold = new Date(Date.now() - delayMinutes * 60 * 1000);

  const resultEnded = await prisma.course.updateMany({
    where: {
      status: CourseStatus.AFTER_CLASS,
      endedAt: { not: null, lte: threshold },
      ...(courseIds?.length ? { id: { in: courseIds } } : {}),
    },
    data: { status: CourseStatus.FINISHED },
  });

  // 2. Auto-close scheduled, live, or afterClass courses whose scheduled endTime + delay has passed
  const resultScheduledEnd = await prisma.course.updateMany({
    where: {
      status: {
        in: [CourseStatus.SCHEDULED, CourseStatus.LIVE, CourseStatus.AFTER_CLASS],
      },
      endTime: { not: null, lte: threshold },
      ...(courseIds?.length ? { id: { in: courseIds } } : {}),
    },
    data: { status: CourseStatus.FINISHED },
  });

  // 3. Auto-start scheduled courses whose startTime has passed
  const resultScheduledStart = await prisma.course.updateMany({
    where: {
      status: CourseStatus.SCHEDULED,
      startTime: { not: null, lte: new Date() },
      ...(courseIds?.length ? { id: { in: courseIds } } : {}),
    },
    data: { status: CourseStatus.LIVE },
  });

  return resultEnded.count + resultScheduledEnd.count + resultScheduledStart.count;
}

export async function promoteCourseIfDueById(courseId: string) {
  await promoteCoursesIfDue([courseId]);
  return prisma.course.findUnique({ where: { id: courseId } });
}
