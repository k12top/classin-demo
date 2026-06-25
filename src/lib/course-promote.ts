import { CourseStatus, getFinishedDelayMinutes } from "@/lib/course-status";
import { prisma } from "@/lib/db";

/** Promote courses to finished only when their scheduled end time is due. */
export async function promoteCoursesIfDue(
  courseIds?: string[]
): Promise<number> {
  const delayMinutes = getFinishedDelayMinutes();
  const threshold = new Date(Date.now() - delayMinutes * 60 * 1000);

  // Auto-close scheduled, live, or afterClass courses whose scheduled endTime + delay has passed.
  // Agora afterClass/exit time is intentionally not a fallback close time.
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

  // Auto-start scheduled courses whose startTime has passed.
  const resultScheduledStart = await prisma.course.updateMany({
    where: {
      status: CourseStatus.SCHEDULED,
      startTime: { not: null, lte: new Date() },
      ...(courseIds?.length ? { id: { in: courseIds } } : {}),
    },
    data: { status: CourseStatus.LIVE },
  });

  // 4. Auto-generate recordUrl for finished courses if recording is enabled
  const isRecordingEnabled = process.env.NEXT_PUBLIC_AGORA_RECORDING_ENABLED === "true";
  if (isRecordingEnabled) {
    const finishedWithoutUrl = await prisma.course.findMany({
      where: {
        status: CourseStatus.FINISHED,
        recordUrl: null,
        ...(courseIds?.length ? { id: { in: courseIds } } : {}),
      },
      select: { id: true, roomType: true },
    });

    for (const course of finishedWithoutUrl) {
      const roomUuid = course.id.replace(/-/g, "").slice(0, 16);
      const recordUrl = `https://solutions-apaas.agora.io/static/record_page_prod.html?roomUuid=${roomUuid}&roomType=${course.roomType}`;
      await prisma.course.update({
        where: { id: course.id },
        data: { recordUrl },
      });
    }
  }

  return resultScheduledEnd.count + resultScheduledStart.count;
}

export async function promoteCourseIfDueById(courseId: string) {
  await promoteCoursesIfDue([courseId]);
  return prisma.course.findUnique({ where: { id: courseId } });
}
