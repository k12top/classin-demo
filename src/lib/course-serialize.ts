import { statusLabel } from "@/lib/course-status";

type CourseLike = Record<string, unknown> & { status: string };

type SessionLike = {
  id: string;
  status: string;
  roomUuid: string;
  roomType: number;
  startTime: Date | string;
  endTime: Date | string;
  title?: string;
  position?: number;
};

function sessionsOf(course: CourseLike): SessionLike[] {
  return Array.isArray(course.sessions)
    ? (course.sessions as SessionLike[])
    : [];
}

function displaySession(sessions: SessionLike[], now = new Date()) {
  return (
    sessions.find((session) => session.status === "live" || session.status === "afterClass") ||
    sessions.find((session) => new Date(session.endTime) >= now && session.status === "scheduled") ||
    sessions.at(-1) ||
    null
  );
}

export function serializeCourse<T extends CourseLike>(
  course: T
): T & {
  statusLabel: string;
  nextSession: SessionLike | null;
  sessionCount: number;
  completedSessionCount: number;
} {
  const sessions = sessionsOf(course);
  const primary = displaySession(sessions);
  const status = primary?.status || course.status;
  return {
    ...course,
    ...(primary
      ? {
          status,
          roomUuid: primary.roomUuid,
          roomType: primary.roomType,
          startTime: primary.startTime,
          endTime: primary.endTime,
        }
      : {}),
    statusLabel: statusLabel(status),
    nextSession: primary,
    sessionCount: sessions.length,
    completedSessionCount: sessions.filter((session) => session.status === "finished").length,
  };
}

export function serializeCourses<T extends CourseLike>(
  courses: T[]
): ReturnType<typeof serializeCourse<T>>[] {
  return courses.map(serializeCourse);
}
