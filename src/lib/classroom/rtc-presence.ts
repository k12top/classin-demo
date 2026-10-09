import { participantOwnerId } from "./participant-identity";
import type { ClassroomMediaSnapshot, ClassroomMemberSnapshot } from "./types";

/** RTC membership supplies presence during delayed HTTP heartbeats, never grants. */
export function reconcileClassroomRtcPresence(
  members: ClassroomMemberSnapshot[],
  media: ClassroomMediaSnapshot,
): ClassroomMemberSnapshot[] {
  if (media.connectionState !== "connected") return members;
  const connected = new Set(media.participants
    .filter((participant) => participant.kind === "camera")
    .map((participant) => participantOwnerId(participant.id, members)));
  return members.map((member) => connected.has(member.userId) && !member.online
    ? { ...member, online: true }
    : member);
}
