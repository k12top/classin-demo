import { CourseStatus, getFinishedDelayMinutes } from "@/lib/course-status";
import { closeOpenAttendanceSessionsForCourse } from "@/lib/course-attendance";
import { stopRecordingAttempt } from "@/lib/classroom/server/recording-orchestrator";
import { retryFailedLiveRecordings } from "@/lib/classroom/server/recording-orchestrator";
import { prisma } from "@/lib/db";

function courseAttendanceCloseTime(
  endTime: Date | null | undefined,
  now = new Date()
): Date {
  return endTime && endTime <= now ? endTime : now;
}

/** Promote courses to finished only when their scheduled end time is due. */
export async function promoteCoursesIfDue(
  courseIds?: string[],
  options: { reconcileRecordings?: boolean } = {},
): Promise<number> {
  const reconcileRecordings = options.reconcileRecordings ?? true;
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
  if (coursesToFinish.length > 0) {
    await prisma.classroomRuntime.updateMany({
      where: { courseId: { in: coursesToFinish.map((course) => course.id) } },
      data: { status: "ended", revision: { increment: 1 } },
    });
  }

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

  // Any non-live classroom state must also stop its cloud recorder. Retry
  // previously failed stops on later cron runs because an orphan recorder can
  // keep billing even after the platform course has ended.
  if (reconcileRecordings) {
    const recordingsToStop = await prisma.classroomRecording.findMany({
      where: {
        status: { in: ["recording", "stopping"] },
        course: {
          status: {
            in: [
              CourseStatus.AFTER_CLASS,
              CourseStatus.FINISHED,
              CourseStatus.CANCELLED,
            ],
          },
          ...(courseIds?.length ? { id: { in: courseIds } } : {}),
        },
      },
    });
    for (const recording of recordingsToStop) {
      try {
        await stopRecordingAttempt(recording);
      } catch (error) {
        console.error("[classroom:recording] lifecycle stop failed", {
          courseId: recording.courseId,
          recordingId: recording.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
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

  // Per-course reads call this function as a deadline fallback. Recording
  // retries belong to the minute-level global reconciliation only, otherwise
  // a 5-second client poll would repeatedly attempt provider startup.
  if (reconcileRecordings && !courseIds?.length) {
    await retryFailedLiveRecordings();
  }

  return resultScheduledEnd.count + resultScheduledStart.count;
}

export async function promoteCourseIfDueById(
  courseId: string,
  options: { reconcileRecordings?: boolean } = {},
) {
  await promoteCoursesIfDue([courseId], options);
  return prisma.course.findUnique({ where: { id: courseId } });
}
