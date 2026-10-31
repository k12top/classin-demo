import "server-only";
import type { Prisma } from "@prisma/client";
import { classroomGraceEndAt } from "../policy";
import { isClassroomOvertime, teacherConnectionBlocksEnd } from "../overtime-leave";
import { CourseStatus } from "@/lib/course-status";
import { closeAllOpenAttendanceForLesson } from "@/lib/course-attendance";
import { enqueueClassroomEvent } from "./integration-events";

/** Caller holds the runtime lock also used by joins, departures and timing edits. */
export async function endOvertimeAfterTeacherLeave(tx: Prisma.TransactionClient,
  sessionId: string, userId: string, now: Date) {
  await tx.$queryRaw`SELECT "id" FROM "CourseSession" WHERE "id" = ${sessionId} FOR UPDATE`;
  const runtime = await tx.classroomRuntime.findUnique({ where: { sessionId } });
  const lesson = await tx.courseSession.findUnique({ where: { id: sessionId } });
  const actor = await tx.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId, userId } }, select: { role: true } });
  if (!runtime?.startedAt || runtime.status !== "live" || !lesson || lesson.status !== "live" || lesson.endedAt || (actor?.role !== "teacher" && actor?.role !== "assistant") ||
      !isClassroomOvertime(lesson.endTime, classroomGraceEndAt(lesson.endTime), now)) return null;
  // "Finished teaching" releases this person's earlier temporary departures,
  // including a different device used before returning. Open devices and other
  // teachers' temporary reservations must continue to block automatic end.
  await tx.classroomConnection.updateMany({ where: {
    sessionId, userId, replacedAt: null, leaveIntent: "temporary", leftAt: { not: null },
    OR: [{ lastSeenAt: { gte: runtime.startedAt } }, { leftAt: { gte: runtime.startedAt } }],
  }, data: { leaveIntent: "finishIfLastTeacher" } });
  // Assistants may still be teaching. Students and recording bots do not keep a teacher's seat.
  const teachers = await tx.classroomMemberState.findMany({ where: { sessionId, role: { in: ["teacher", "assistant"] } }, select: { userId: true } });
  const connections = await tx.classroomConnection.findMany({ where: { sessionId, userId: { in: teachers.map(teacher => teacher.userId) }, replacedAt: null } });
  if (connections.some(connection => teacherConnectionBlocksEnd(connection, runtime.startedAt!, now))) return null;
  await closeAllOpenAttendanceForLesson(sessionId, now, tx);
  await tx.classroomRuntime.update({ where: { sessionId }, data: {
    status: "ended", revision: { increment: 1 }, transcriptionStatus: "stopping",
  } });
  // Persist the stop before acknowledging leave; cron can recover a lost after callback.
  await tx.classroomRecording.updateMany({ where: { sessionId, stopRequestedAt: null,
    OR: [{ status: { in: ["starting", "recording", "stopping", "processing"] } }, { status: "failed", failureStage: "start-unknown" }],
  }, data: { status: "stopping", stopRequestedAt: now, lastProviderCheckAt: null } });
  await tx.courseSession.update({ where: { id: sessionId }, data: {
    status: CourseStatus.AFTER_CLASS, endedAt: now,
  } });
  await enqueueClassroomEvent(tx, sessionId, "classroom.ended", "last_teacher_overtime_leave", { userId, role: actor.role });
  return { courseId: lesson.courseId, endedAt: now };
}
