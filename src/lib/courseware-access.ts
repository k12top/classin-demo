import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { casdoorUserIdCandidates, userCanTeachCourse } from "@/lib/course-teacher";
import {
  getEffectiveSessionRoster,
  rosterContainsUser,
} from "@/lib/course-session-roster";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";

type CoursewareIdentity = Pick<SessionPayload, "userId" | "name">;

function identityCandidates(session: CoursewareIdentity) {
  return Array.from(
    new Set(
      [session.userId, session.name || ""].flatMap((value) =>
        casdoorUserIdCandidates(value),
      ),
    ),
  );
}

export type CoursewareAccessScope = {
  allowed: boolean;
  canTeachCourse: boolean;
  teaching: boolean;
  scope: "course" | "session" | "none";
  sessionId: string | null;
};

/**
 * Resolve whether a user can browse the whole course library or only the
 * materials exposed to one lesson. Temporary lesson members never inherit
 * access to the long-lived course library.
 */
export async function resolveCoursewareAccess(
  session: CoursewareIdentity,
  courseId: string,
  requestedSessionId?: string | null,
): Promise<CoursewareAccessScope> {
  const candidates = identityCandidates(session);
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      teachers: { select: { teacherId: true } },
      students: { select: { studentId: true } },
      groupLinks: {
        include: { group: { include: { members: { select: { userId: true } } } } },
      },
    },
  });

  if (!course) {
    return {
      allowed: false,
      canTeachCourse: false,
      teaching: false,
      scope: "none",
      sessionId: null,
    };
  }
  const canTeach = userCanTeachCourse(course, candidates);
  const isCourseStudent =
    course.students.some((student) =>
      candidates.some((candidate) =>
        casdoorUserIdsMatch(student.studentId, candidate),
      ),
    ) ||
    course.groupLinks.some((link) =>
      link.group.members.some((member) =>
        candidates.some((candidate) =>
          casdoorUserIdsMatch(member.userId, candidate),
        ),
      ),
    );

  if (canTeach || isCourseStudent) {
    return {
      allowed: true,
      canTeachCourse: canTeach,
      teaching: canTeach,
      scope: "course",
      sessionId: requestedSessionId || null,
    };
  }

  if (requestedSessionId) {
    const lesson = await prisma.courseSession.findFirst({
      where: { id: requestedSessionId, courseId },
      select: { id: true },
    });
    if (lesson) {
      const roster = await getEffectiveSessionRoster(lesson.id);
      const member = roster ? rosterContainsUser(roster, candidates) : null;
      if (member) {
        return {
          allowed: true,
          canTeachCourse: false,
          teaching: member.kind === "teacher",
          scope: "session",
          sessionId: lesson.id,
        };
      }
    }
  }

  return {
    allowed: false,
    canTeachCourse: false,
    teaching: false,
    scope: "none",
    sessionId: null,
  };
}

export type SessionCoursewareShape = {
  id: string;
  courseId: string;
  sessionId: string | null;
};

/** Whether a shared or lesson-owned file is exposed to a concrete lesson. */
export async function isCoursewareAvailableInSession(
  courseware: SessionCoursewareShape,
  sessionId: string,
): Promise<boolean> {
  const lesson = await prisma.courseSession.findFirst({
    where: { id: sessionId, courseId: courseware.courseId },
    select: { id: true },
  });
  if (!lesson) return false;
  if (courseware.sessionId === sessionId) return true;

  const rule = await prisma.courseSessionCourseware.findUnique({
    where: {
      sessionId_coursewareId: {
        sessionId,
        coursewareId: courseware.id,
      },
    },
    select: { action: true },
  });
  if (rule?.action === "include") return true;
  if (rule?.action === "exclude") return false;
  return courseware.sessionId === null;
}

/** Checks whether a teaching teacher, assigned student, or linked-group member can access a course file. */
export async function canAccessCourseware(
  session: CoursewareIdentity,
  courseId: string,
): Promise<boolean> {
  return (await resolveCoursewareAccess(session, courseId)).allowed;
}
