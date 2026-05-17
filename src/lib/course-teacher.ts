import { casdoorUserIdsMatch } from "@/lib/casdoor-user";
import { prisma } from "@/lib/db";

export async function assertTeacherOwnsCourse(
  userId: string,
  courseId: string
): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { teacherId: true },
  });
  return Boolean(course && casdoorUserIdsMatch(course.teacherId, userId));
}
