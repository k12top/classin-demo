import { CourseStatus } from "@/lib/course-status";

export type CourseStatusLesson = {
  status: string;
  startTime: Date;
  endTime: Date;
  endedAt: Date | null;
};

export function aggregateCourseSessionStatus(
  sessions: CourseStatusLesson[],
  now = new Date(),
) {
  const active = sessions.find(
    (lesson) =>
      !lesson.endedAt &&
      (lesson.status === CourseStatus.LIVE || lesson.status === CourseStatus.AFTER_CLASS),
  );
  if (active) return active.status;
  const upcoming = sessions.find(
    (lesson) =>
      !lesson.endedAt &&
      lesson.status === CourseStatus.SCHEDULED &&
      lesson.endTime >= now,
  );
  if (upcoming) return CourseStatus.SCHEDULED;
  if (sessions.length && sessions.every((lesson) => lesson.status === CourseStatus.CANCELLED)) {
    return CourseStatus.CANCELLED;
  }
  return sessions.length ? CourseStatus.FINISHED : CourseStatus.SCHEDULED;
}
