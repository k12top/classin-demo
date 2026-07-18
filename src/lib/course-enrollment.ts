import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { userCanTeachCourse } from "@/lib/course-teacher";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";

type CourseMembershipSnapshot = {
  id: string;
  ownerId?: string | null;
  teacherId: string;
  teachers?: { teacherId: string }[];
  students: { studentId: string }[];
  groupLinks: {
    group: {
      members: { userId: string }[];
    };
  }[];
};

type ShareLinkSession = Pick<
  SessionPayload,
  "userId" | "name" | "displayName" | "avatar"
>;

export type ShareLinkCourseAccess = {
  role: "teacher" | "student";
  enrolled: boolean;
};

function sessionStudentIdCandidates(
  session: Pick<SessionPayload, "userId" | "name">
): string[] {
  const values = [session.userId, session.name || ""].flatMap((value) => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const stripped = trimmed.includes("/") ? trimmed.split("/").pop() || trimmed : trimmed;
    return [trimmed, stripped];
  });
  return Array.from(new Set(values.filter(Boolean)));
}

/**
 * Apply the share-link role policy for a known course.
 *
 * Platform-level teacher status does not grant teaching permissions in every
 * course. Only the course owner or an assigned teaching teacher keeps the
 * teacher role; every other authenticated user joins as a student.
 */
export async function ensureShareLinkCourseAccess(
  course: CourseMembershipSnapshot,
  session: ShareLinkSession
): Promise<ShareLinkCourseAccess> {
  const identityCandidates = sessionStudentIdCandidates(session);
  const isCourseTeacher = userCanTeachCourse(course, identityCandidates);
  if (isCourseTeacher) {
    return { role: "teacher", enrolled: false };
  }

  const isDirectStudent = course.students.some((student) =>
    identityCandidates.some((candidate) =>
      casdoorUserIdsMatch(student.studentId, candidate)
    )
  );
  const isGroupStudent = course.groupLinks.some((link) =>
    link.group.members.some((member) =>
      identityCandidates.some((candidate) =>
        casdoorUserIdsMatch(member.userId, candidate)
      )
    )
  );

  if (isDirectStudent || isGroupStudent) {
    return { role: "student", enrolled: false };
  }

  const created = await prisma.courseStudent.createMany({
    data: [
      {
        courseId: course.id,
        studentId: session.userId,
        studentName: session.displayName || session.name || session.userId,
        studentAvatar: session.avatar || "",
      },
    ],
    skipDuplicates: true,
  });

  return { role: "student", enrolled: created.count > 0 };
}

export async function ensureStudentEnrolledInCourse(
  courseId: string,
  session: ShareLinkSession
): Promise<{ enrolled: boolean }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      teachers: { select: { teacherId: true } },
      students: { select: { studentId: true } },
      groupLinks: {
        include: {
          group: {
            include: {
              members: { select: { userId: true } },
            },
          },
        },
      },
    },
  });

  if (!course) {
    return { enrolled: false };
  }

  const access = await ensureShareLinkCourseAccess(course, session);
  return { enrolled: access.enrolled };
}
