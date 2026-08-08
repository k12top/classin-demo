import { statusLabel } from "@/lib/course-status";

type CourseLike = Record<string, unknown> & { status: string };

type SessionLike = {
  id: string;
  status: string;
  roomUuid: string;
  roomType: number;
  startTime: Date | string;
  endTime: Date | string;
  endedAt?: Date | string | null;
  title?: string;
  position?: number;
  _count?: { recordings?: number };
};

function sessionsOf(course: CourseLike): SessionLike[] {
  return Array.isArray(course.sessions)
    ? (course.sessions as SessionLike[])
    : [];
}

function displaySession(sessions: SessionLike[], now = new Date()) {
  return (
    sessions.find((session) =>
      !session.endedAt &&
      (session.status === "live" || session.status === "afterClass"),
    ) ||
    sessions.find((session) =>
      !session.endedAt &&
      new Date(session.endTime) >= now &&
      session.status === "scheduled",
    ) ||
    sessions.at(-1) ||
    null
  );
}

function effectiveSessionStatus(session: SessionLike) {
  return session.endedAt && session.status !== "cancelled"
    ? "finished"
    : session.status;
}

export function serializeCourse<T extends CourseLike>(
  course: T
): T & {
  statusLabel: string;
  nextSession: SessionLike | null;
  sessionCount: number;
  completedSessionCount: number;
  hasPlayback: boolean;
} {
  const sessions = sessionsOf(course);
  const primary = displaySession(sessions);
  const status = primary ? effectiveSessionStatus(primary) : course.status;
  const legacyRecordUrl =
    typeof course.recordUrl === "string" ? course.recordUrl.trim() : "";
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
    completedSessionCount: sessions.filter(
      (session) => effectiveSessionStatus(session) === "finished",
    ).length,
    hasPlayback:
      Boolean(legacyRecordUrl) ||
      sessions.some((session) => (session._count?.recordings || 0) > 0),
  };
}

export function serializeCourses<T extends CourseLike>(
  courses: T[]
): ReturnType<typeof serializeCourse<T>>[] {
  return courses.map(serializeCourse);
}
