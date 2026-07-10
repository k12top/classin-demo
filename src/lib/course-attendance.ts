import { prisma } from "@/lib/db";

export function attendanceDurationSec(enteredAt: Date, leftAt: Date): number {
  return Math.max(0, Math.floor((leftAt.getTime() - enteredAt.getTime()) / 1000));
}

export async function closeOpenAttendanceSessions(
  courseId: string,
  studentId: string,
  leftAt = new Date()
) {
  const openSessions = await prisma.courseAttendance.findMany({
    where: {
      courseId,
      studentId,
      leftAt: null,
    },
    select: {
      id: true,
      enteredAt: true,
    },
  });

  if (openSessions.length === 0) {
    return { closed: 0 };
  }

  await prisma.$transaction(
    openSessions.map((session) =>
      prisma.courseAttendance.update({
        where: { id: session.id },
        data: {
          leftAt,
          durationSec: attendanceDurationSec(session.enteredAt, leftAt),
        },
      })
    )
  );

  return { closed: openSessions.length };
}
