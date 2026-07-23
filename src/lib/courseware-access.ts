import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { casdoorUserIdCandidates, userCanTeachCourse } from "@/lib/course-teacher";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";

/** Checks whether a teaching teacher, assigned student, or linked-group member can access a course file. */
export async function canAccessCourseware(
  session: Pick<SessionPayload, "userId" | "name">,
  courseId: string,
): Promise<boolean> {
  const identityCandidates = Array.from(
    new Set(
      [session.userId, session.name || ""].flatMap((value) =>
        casdoorUserIdCandidates(value),
      ),
    ),
  );
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

  if (!course) return false;
  if (userCanTeachCourse(course, identityCandidates)) return true;

  return (
    course.students.some((student) =>
      identityCandidates.some((candidate) =>
        casdoorUserIdsMatch(student.studentId, candidate),
      ),
    ) ||
    course.groupLinks.some((link) =>
      link.group.members.some((member) =>
        identityCandidates.some((candidate) =>
          casdoorUserIdsMatch(member.userId, candidate),
        ),
      ),
    )
  );
}
