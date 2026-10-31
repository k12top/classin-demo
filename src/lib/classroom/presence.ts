import type { ClassroomMemberSnapshot } from "./types";

export const CLASSROOM_ONLINE_WINDOW_MS = 45_000;
export const CLASSROOM_RECONNECT_WINDOW_MS = 120_000;

/** Age server leases in its clock domain, even on a device with a skewed clock. */
export function classroomPresenceClockOffset(observedAt?: string, receivedAt = Date.now()): number {
  const timestamp = Date.parse(observedAt || "");
  return Number.isFinite(timestamp) ? receivedAt - timestamp : 0;
}

/** A reconnecting seat is visible but must not count as an online student. */
export function classroomMemberVisible(member: ClassroomMemberSnapshot): boolean {
  return member.online || member.connectionStatus === "reconnecting";
}

/** Keep departed members in the roster without retaining a live stage seat. */
export function classroomMemberAway(member: ClassroomMemberSnapshot): boolean {
  return !member.online && member.connectionStatus === "offline";
}

/** Count people in the room, including offstage learners; reconnecting seats stay separate. */
export function classroomPresenceSummary(members: ClassroomMemberSnapshot[]) {
  const online = members.filter(member => member.online);
  return {
    online: online.length,
    students: online.filter(member => member.role === "student").length,
    teachers: online.filter(member => member.role === "teacher").length,
    assistants: online.filter(member => member.role === "assistant").length,
    away: members.filter(classroomMemberAway).length,
    reconnecting: members.filter(member => !member.online && member.connectionStatus === "reconnecting").length,
  };
}

export function classroomConnectionPresence(input: {
  lastSeenAt: Date | null;
  online: boolean;
  mayReconnect: boolean;
}, now = Date.now()) {
  const until = input.lastSeenAt ? input.lastSeenAt.getTime() + CLASSROOM_RECONNECT_WINDOW_MS : 0;
  const connectionStatus = input.online ? "online" : input.mayReconnect && until > now ? "reconnecting" : "offline";
  return {
    online: input.online,
    connectionStatus,
    lastSeenAt: input.lastSeenAt?.toISOString() ?? null,
    reconnectUntil: connectionStatus === "offline" ? null : new Date(until).toISOString(),
  } as const;
}
