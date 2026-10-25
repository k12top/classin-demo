import { participantOwnerId, type RtcMember } from "./participant-identity";

type Member = RtcMember;

/** Local RTC identity remains valid when a database heartbeat is delayed. */
export function classroomParticipantOwnerId(
  participant: { id: string; isLocal: boolean },
  members: readonly Member[],
  currentUserId: string,
): string {
  if (participant.isLocal && currentUserId) return currentUserId;
  return participantOwnerId(participant.id, members);
}
