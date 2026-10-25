import { classroomRtcUid, classroomAuxiliaryRtcUid } from "./rtc-uid";

export type RtcMember = {
  userId: string;
  rtcUids?: number[];
  screenUids?: number[];
  auxiliaryCameraUids?: number[];
};

export function participantOwnerId(participantId: string, members: readonly RtcMember[] = []): string {
  // Resolve explicit connection identities across ALL members before trying
  // legacy hashes. A departed user's legacy UID must never steal a new peer.
  const exactOwners = members.filter(member => [
    ...(member.rtcUids ?? []), ...(member.screenUids ?? []),
    ...(member.auxiliaryCameraUids ?? (member.rtcUids ?? []).map(classroomAuxiliaryRtcUid)),
  ].some(uid => String(uid) === participantId));
  if (exactOwners.length) return new Set(exactOwners.map(member => member.userId)).size === 1 ? exactOwners[0].userId : "";
  const owner = members.find((member) => {
    // An empty array is an authoritative departure, not a legacy payload.
    if (member.rtcUids !== undefined || member.screenUids !== undefined) return false;
    const cameraUid = classroomRtcUid(member.userId, "camera");
    return [
      cameraUid,
      classroomRtcUid(member.userId, "screen"),
      classroomAuxiliaryRtcUid(cameraUid),
    ].some((uid) => String(uid) === participantId);
  });
  if (owner) return owner.userId;
  for (const suffix of ["::screen", "::auxiliary-camera"]) {
    if (participantId.endsWith(suffix)) return participantId.slice(0, -suffix.length);
  }
  return participantId;
}
