import { participantOwnerId } from "./participant-identity";
import type { ClassroomMediaSnapshot, ClassroomMemberSnapshot } from "./types";
import { CLASSROOM_ONLINE_WINDOW_MS } from "./presence";

/** RTC membership supplies presence during delayed HTTP heartbeats, never grants. */
export function reconcileClassroomRtcPresence(
  members: ClassroomMemberSnapshot[],
  media: ClassroomMediaSnapshot,
  now = Date.now(),
  roomMedia?: ClassroomMediaSnapshot,
  presenceUncertain = false,
): ClassroomMemberSnapshot[] {
  const connected = new Set([media, roomMedia].flatMap((snapshot) => snapshot?.connectionState === "connected" ? snapshot.participants : [])
    .filter((participant) => participant.kind === "camera")
    .map((participant) => participantOwnerId(participant.id, members)));
  const reconciled = members.map<ClassroomMemberSnapshot>((member) => {
    if (connected.has(member.userId)) {
      return member.online && member.connectionStatus !== "reconnecting" ? member : { ...member, online: true, ...(member.connectionStatus && { connectionStatus: "online" as const }) };
    }
    if (presenceUncertain) return member;
    // Older payloads have no deadlines; retain their existing behavior.
    if (!member.connectionStatus || !member.lastSeenAt) return member;
    const seenAt = Date.parse(member.lastSeenAt);
    const until = Date.parse(member.reconnectUntil || "");
    const online = member.online && now - seenAt <= CLASSROOM_ONLINE_WINDOW_MS;
    const connectionStatus = online ? "online" : until > now ? "reconnecting" : "offline";
    return online === member.online && connectionStatus === member.connectionStatus ? member : { ...member, online, connectionStatus };
  });
  return reconciled.every((member, index) => member === members[index]) ? members : reconciled;
}
