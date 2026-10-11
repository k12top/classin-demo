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
