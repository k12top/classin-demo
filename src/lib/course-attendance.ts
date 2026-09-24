import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export function attendanceDurationSec(enteredAt: Date, leftAt: Date): number {
  return Math.max(0, Math.floor((leftAt.getTime() - enteredAt.getTime()) / 1000));
}

async function closeAttendanceSessions(
  where: { courseId?: string; sessionId?: string; studentId?: string },
  leftAt: Date
) {
  const predicates: Prisma.Sql[] = [Prisma.sql`"leftAt" IS NULL`];
  if (where.courseId) {
    predicates.push(Prisma.sql`"courseId" = ${where.courseId}`);
  }
  if (where.sessionId) {
    predicates.push(Prisma.sql`"sessionId" = ${where.sessionId}`);
  }
  if (where.studentId) {
    predicates.push(Prisma.sql`"studentId" = ${where.studentId}`);
  }

  // A single set-based update avoids Prisma's default five-second interactive
  // transaction timeout when a legacy course has thousands of stale open rows.
  // The duration expression is the SQL equivalent of attendanceDurationSec.
  const closed = await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "CourseAttendance"
      SET
        "leftAt" = ${leftAt},
        "durationSec" = GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (${leftAt}::timestamptz - "enteredAt")))
        )::integer
      WHERE ${Prisma.join(predicates, " AND ")}
    `,
  );

  return { closed };
}

export async function closeOpenAttendanceSessions(
  courseId: string,
  studentId: string,
  leftAt = new Date()
) {
  return closeAttendanceSessions({ courseId, studentId }, leftAt);
}

export async function closeOpenAttendanceSessionsForCourse(
  courseId: string,
  leftAt = new Date()
) {
  return closeAttendanceSessions({ courseId }, leftAt);
}

export async function closeOpenAttendanceSessionsForLesson(
  sessionId: string,
  studentId: string,
  leftAt = new Date(),
) {
  return closeAttendanceSessions({ sessionId, studentId }, leftAt);
}

export async function closeAllOpenAttendanceForLesson(
  sessionId: string,
  leftAt = new Date(),
) {
  return closeAttendanceSessions({ sessionId }, leftAt);
}
