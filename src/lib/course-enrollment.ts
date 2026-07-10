import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { userCanTeachCourse } from "@/lib/course-teacher";
import { prisma } from "@/lib/db";
import type { SessionPayload } from "@/lib/session";

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

export async function ensureStudentEnrolledInCourse(
  courseId: string,
  session: Pick<
    SessionPayload,
    "userId" | "name" | "displayName" | "avatar"
  >
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

  if (!course || userCanTeachCourse(course, session.userId)) {
    return { enrolled: false };
  }

  const studentIdCandidates = sessionStudentIdCandidates(session);
  const isDirectStudent = course.students.some((student) =>
    studentIdCandidates.some((candidate) =>
      casdoorUserIdsMatch(student.studentId, candidate)
    )
  );
  const isGroupStudent = course.groupLinks.some((link) =>
    link.group.members.some((member) =>
      studentIdCandidates.some((candidate) =>
        casdoorUserIdsMatch(member.userId, candidate)
      )
    )
  );

  if (isDirectStudent || isGroupStudent) {
    return { enrolled: false };
  }

  await prisma.courseStudent.createMany({
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

  return { enrolled: true };
}
