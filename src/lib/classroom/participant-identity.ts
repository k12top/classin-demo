import { classroomRtcUid } from "./rtc-uid";

type RtcMember = {
  userId: string;
  rtcUids?: number[];
  screenUids?: number[];
};

export function participantOwnerId(participantId: string, members: readonly RtcMember[] = []): string {
  const owner = members.find((member) => {
    const cameraUid = classroomRtcUid(member.userId, "camera");
    return [
      ...(member.rtcUids ?? []),
      ...(member.screenUids ?? []),
      // Older bootstrap payloads only contain main and screen connection IDs.
      cameraUid,
      classroomRtcUid(member.userId, "screen"),
    ].some((uid) => String(uid) === participantId);
  });
  if (owner) return owner.userId;
  for (const suffix of ["::screen"]) {
    if (participantId.endsWith(suffix)) return participantId.slice(0, -suffix.length);
  }
  return participantId;
}
