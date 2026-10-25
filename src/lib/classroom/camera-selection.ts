import { classroomParticipantOwnerId } from "./local-participant";
import type { RtcMember } from "./participant-identity";
import type { ClassroomParticipant } from "./types";

/** One main camera per account across podium, board, gallery and recorder. */
export function selectClassroomCameraParticipants(
  participants: readonly ClassroomParticipant[], members: readonly RtcMember[], currentUserId = "",
): ClassroomParticipant[] {
  const hasIdentityRoster = members.some(member => member.rtcUids !== undefined);
  const cameras = new Map<string, ClassroomParticipant>();
  const owner = (participant: ClassroomParticipant) => classroomParticipantOwnerId(participant, members, currentUserId);
  // The local camera is authoritative for this account, including its off state.
  // A second device must never replace the preview after this device is muted.
  const score = (participant: ClassroomParticipant) => Number(participant.hasVideo) * 4 + Number(participant.isLocal) * 16 + Number(participant.hasAudio);
  for (const participant of participants) {
    if (participant.kind !== "camera") continue;
    const userId = owner(participant);
    if (!userId || (hasIdentityRoster && !members.some(member => member.userId === userId))) continue; // Conflicting mappings are never attached to a named seat.
    const prior = cameras.get(userId);
    if (!prior || score(participant) > score(prior) ||
      (score(participant) === score(prior) && participant.id.localeCompare(prior.id, "en") < 0)) cameras.set(userId, participant);
  }
  return participants.filter(participant => participant.kind !== "camera" || cameras.get(owner(participant)) === participant);
}
