import { CourseStatus } from "@/lib/course-status";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { aggregateCourseSessionStatus } from "@/lib/course-session-status-logic";

export async function syncCourseStatusFromSessions(
  courseId: string,
  client: Prisma.TransactionClient = prisma,
) {
  const sessions = await client.courseSession.findMany({
    where: { courseId },
    orderBy: [{ startTime: "asc" }, { position: "asc" }],
    select: {
      roomUuid: true,
      roomType: true,
      status: true,
      startTime: true,
      endTime: true,
      endedAt: true,
    },
  });
  const now = new Date();
  const status = aggregateCourseSessionStatus(sessions, now);
  const display =
    sessions.find(
      (lesson) =>
        !lesson.endedAt &&
        (lesson.status === CourseStatus.LIVE || lesson.status === CourseStatus.AFTER_CLASS),
    ) ||
    sessions.find(
      (lesson) =>
        !lesson.endedAt &&
        lesson.status === CourseStatus.SCHEDULED &&
        lesson.endTime >= now,
    ) ||
    sessions.at(-1);
  return client.course.update({
    where: { id: courseId },
    data: {
      status,
      ...(display
        ? {
            roomUuid: display.roomUuid,
            roomType: display.roomType,
            startTime: display.startTime,
            endTime: display.endTime,
            endedAt:
              display.endedAt && display.status !== CourseStatus.CANCELLED
                ? display.endedAt
                : null,
          }
        : {}),
    },
  });
}
