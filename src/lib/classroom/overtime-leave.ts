import { CLASSROOM_RECONNECT_WINDOW_MS } from "./presence";

export type ClassroomLeaveIntent = "temporary" | "finishIfLastTeacher";
export type TeacherConnection = {
  lastSeenAt: Date;
  leftAt: Date | null;
  replacedAt?: Date | null;
  leaveIntent?: string | null;
};

export function isClassroomOvertime(endTime: Date, graceEndsAt: Date | null, now: Date): boolean {
  return Boolean(graceEndsAt && endTime <= now && now < graceEndsAt);
}

/** A temporary absence reserves the teacher's place until return or the hard deadline.
 * Disconnected/refreshed devices retain the existing reconnection window. */
export function teacherConnectionBlocksEnd(connection: TeacherConnection, startedAt: Date, now: Date): boolean {
  if (connection.replacedAt) return false;
  // Redis can own newer heartbeats than PostgreSQL. An unclosed durable connection
  // is not proof of absence, even when its database heartbeat looks old.
  if (!connection.leftAt) return true;
  // A teacher can join the waiting room before the actual class start. Its
  // durable departure, rather than a delayed heartbeat checkpoint, identifies the cycle.
  if (connection.lastSeenAt < startedAt && connection.leftAt < startedAt) return false;
  if (connection.leftAt && connection.leaveIntent === "finishIfLastTeacher") return false;
  if (connection.leftAt && connection.leaveIntent === "temporary") return true;
  const lastActivity = Math.max(connection.lastSeenAt.getTime(), connection.leftAt?.getTime() ?? 0);
  return lastActivity + CLASSROOM_RECONNECT_WINDOW_MS > now.getTime();
}
