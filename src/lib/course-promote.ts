import { CourseStatus, getFinishedDelayMinutes } from "@/lib/course-status";
import { closeOpenAttendanceSessionsForCourse } from "@/lib/course-attendance";
import { prisma } from "@/lib/db";

function courseAttendanceCloseTime(
  endTime: Date | null | undefined,
  now = new Date()
): Date {
  return endTime && endTime <= now ? endTime : now;
}

/** Promote courses to finished only when their scheduled end time is due. */
export async function promoteCoursesIfDue(
  courseIds?: string[]
): Promise<number> {
  const delayMinutes = getFinishedDelayMinutes();
  const now = new Date();
  const threshold = new Date(now.getTime() - delayMinutes * 60 * 1000);
  const finishWhere = {
    status: {
      in: [CourseStatus.SCHEDULED, CourseStatus.LIVE, CourseStatus.AFTER_CLASS],
    },
    endTime: { not: null, lte: threshold },
    ...(courseIds?.length ? { id: { in: courseIds } } : {}),
  };

  const coursesToFinish = await prisma.course.findMany({
    where: finishWhere,
    select: { id: true, endTime: true },
  });

  // Auto-close scheduled, live, or afterClass courses whose scheduled endTime + delay has passed.
  // Agora afterClass/exit time is intentionally not a fallback close time.
  const resultScheduledEnd = await prisma.course.updateMany({
    where: finishWhere,
    data: { status: CourseStatus.FINISHED },
  });

  if (resultScheduledEnd.count > 0) {
    console.info(
      "[course-status]",
      JSON.stringify({
        action: "applied",
        source: "scheduled-end-promotion",
        nextStatus: CourseStatus.FINISHED,
        delayMinutes,
        threshold: threshold.toISOString(),
        courses: coursesToFinish.map((course) => ({
          courseId: course.id,
          scheduledEndTime: course.endTime?.toISOString() ?? null,
        })),
        occurredAt: now.toISOString(),
      }),
    );
  }

  for (const course of coursesToFinish) {
    await closeOpenAttendanceSessionsForCourse(
      course.id,
      courseAttendanceCloseTime(course.endTime, now)
    );
  }

  // Auto-start scheduled courses whose startTime has passed.
  const resultScheduledStart = await prisma.course.updateMany({
    where: {
      status: CourseStatus.SCHEDULED,
      startTime: { not: null, lte: new Date() },
      ...(courseIds?.length ? { id: { in: courseIds } } : {}),
    },
    data: { status: CourseStatus.LIVE },
  });

  if (resultScheduledStart.count > 0) {
    console.info(
      "[course-status]",
      JSON.stringify({
        action: "applied",
        source: "scheduled-start-promotion",
        nextStatus: CourseStatus.LIVE,
        affectedCount: resultScheduledStart.count,
        requestedCourseIds: courseIds ?? null,
        occurredAt: now.toISOString(),
      }),
    );
  }

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
