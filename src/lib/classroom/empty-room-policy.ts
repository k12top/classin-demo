import { CLASSROOM_RECONNECT_WINDOW_MS } from "./presence";

/** Confirmed product default: 3 minutes continuously empty. Zero explicitly disables it. */
export function classroomEmptyGraceMs(value = process.env.CLASSROOM_EMPTY_GRACE_SECONDS): number {
  if (value === undefined || !value.trim()) return 180_000;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 180_000;
}
export type HumanConnection = { lastSeenAt: Date; leftAt: Date | null };
export function classroomEmptySince(connections: HumanConnection[], now: number): number | null {
  if (!connections.length) return null; // Never close a class that has not hosted a human.
  let absentSince = 0;
  for (const connection of connections) {
    const absentAt = connection.leftAt?.getTime() ?? connection.lastSeenAt.getTime() + CLASSROOM_RECONNECT_WINDOW_MS;
    if (absentAt > now) return null;
    absentSince = Math.max(absentSince, absentAt);
  }
  return absentSince;
}
