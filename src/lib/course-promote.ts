import { CourseStatus, getFinishedDelayMinutes } from "@/lib/course-status";
import {
  closeAllOpenAttendanceForLesson,
  closeOpenAttendanceSessionsForCourse,
} from "@/lib/course-attendance";
import { stopRecordingAttempt } from "@/lib/classroom/server/recording-orchestrator";
import { retryFailedLiveRecordings } from "@/lib/classroom/server/recording-orchestrator";
import { reconcilePendingRecordings } from "@/lib/classroom/server/recording-orchestrator";
import { reconcileActiveClassroomTranscriptions } from "@/lib/classroom/server/transcription-orchestrator";
import { reconcileCourseSessionSummaries } from "@/lib/course-session-summary";
import { prisma } from "@/lib/db";

function courseAttendanceCloseTime(
  endTime: Date | null | undefined,
  now = new Date()
): Date {
  return endTime && endTime <= now ? endTime : now;
}

type LessonClosure = {
  id: string;
  endTime: Date;
  endedAt: Date | null;
};

function lessonAttendanceCloseTime(
  lesson: LessonClosure,
  now: Date,
  delayMinutes: number,
): Date {
  if (lesson.endedAt && lesson.endedAt <= now) {
    return lesson.endedAt;
  }
  const graceEnd = new Date(
    lesson.endTime.getTime() + delayMinutes * 60_000,
  );
  if (graceEnd <= now) return graceEnd;
  return now;
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

  const sessionScope = courseIds?.length
    ? { courseId: { in: courseIds } }
    : {};
  const sessionsToFinish = await prisma.courseSession.findMany({
    where: {
      ...sessionScope,
      status: {
        in: [
          CourseStatus.SCHEDULED,
          CourseStatus.LIVE,
          CourseStatus.AFTER_CLASS,
        ],
      },
      endTime: { lte: threshold },
    },
    select: {
      id: true,
      courseId: true,
      endTime: true,
      endedAt: true,
    },
  });

  const [finishedSessions, liveSessions] = await prisma.$transaction([
    prisma.courseSession.updateMany({
      where: {
        ...sessionScope,
        status: {
          in: [
            CourseStatus.SCHEDULED,
            CourseStatus.LIVE,
            CourseStatus.AFTER_CLASS,
          ],
        },
        endTime: { lte: threshold },
      },
      data: { status: CourseStatus.FINISHED },
    }),
    prisma.courseSession.updateMany({
      where: {
        ...sessionScope,
        status: CourseStatus.SCHEDULED,
        startTime: { lte: now },
        // A delayed cron must never revive a lesson that already passed its
        // grace deadline in the same reconciliation run.
        endTime: { gt: threshold },
      },
      data: { status: CourseStatus.LIVE },
    }),
  ]);

  // A manually ended/cancelled lesson may not be part of sessionsToFinish,
  // but it still needs stale attendance, runtime and recorder cleanup.
  const terminalLessonsWithOpenAttendance = await prisma.courseSession.findMany({
    where: {
      ...sessionScope,
      status: {
        in: [
          CourseStatus.AFTER_CLASS,
          CourseStatus.FINISHED,
          CourseStatus.CANCELLED,
        ],
      },
      attendances: { some: { leftAt: null } },
    },
    select: {
      id: true,
      endTime: true,
      endedAt: true,
    },
  });
  const lessonsToClose = new Map<string, LessonClosure>();
  for (const lesson of [
    ...sessionsToFinish,
    ...terminalLessonsWithOpenAttendance,
  ]) {
    lessonsToClose.set(lesson.id, lesson);
  }

  await prisma.classroomRuntime.updateMany({
    where: {
      ...sessionScope,
      status: { not: "ended" },
      session: {
        status: {
          in: [
            CourseStatus.AFTER_CLASS,
            CourseStatus.FINISHED,
            CourseStatus.CANCELLED,
          ],
        },
      },
    },
    data: { status: "ended", revision: { increment: 1 } },
  });

  for (const lesson of lessonsToClose.values()) {
    await closeAllOpenAttendanceForLesson(
      lesson.id,
      lessonAttendanceCloseTime(lesson, now, delayMinutes),
    );
  }

  if (finishedSessions.count > 0 || liveSessions.count > 0) {
    console.info(
      "[course-session-status]",
      JSON.stringify({
        action: "reconciled",
        delayMinutes,
        threshold: threshold.toISOString(),
        started: liveSessions.count,
        finished: finishedSessions.count,
        sessions: sessionsToFinish.map((lesson) => ({
          sessionId: lesson.id,
          courseId: lesson.courseId,
          scheduledEndTime: lesson.endTime.toISOString(),
        })),
        requestedCourseIds: courseIds ?? null,
        occurredAt: now.toISOString(),
      }),
    );
  }

  // Keep the legacy Course fields calibrated during the dual-read rollout.
  // New classroom access and scheduling always use CourseSession above.
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

  // Any terminal lesson must also stop its cloud recorder. Retry
  // previously failed stops on later cron runs because an orphan recorder can
  // keep billing even after the lesson has ended.
  if (reconcileRecordings) {
    const recordingsToStop = await prisma.classroomRecording.findMany({
      where: {
        status: { in: ["recording", "stopping"] },
        session: {
          status: {
            in: [
              CourseStatus.AFTER_CLASS,
              CourseStatus.FINISHED,
              CourseStatus.CANCELLED,
            ],
          },
        },
        ...(courseIds?.length ? { courseId: { in: courseIds } } : {}),
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
    await Promise.all([
      reconcilePendingRecordings(),
      retryFailedLiveRecordings(),
      reconcileActiveClassroomTranscriptions(),
      reconcileCourseSessionSummaries(),
    ]);
  }

  return (
    finishedSessions.count +
    liveSessions.count +
    resultScheduledEnd.count +
    resultScheduledStart.count
  );
}

export async function promoteCourseIfDueById(
  courseId: string,
  options: { reconcileRecordings?: boolean } = {},
) {
  await promoteCoursesIfDue([courseId], options);
  return prisma.course.findUnique({ where: { id: courseId } });
}
