import { classroomRtcUid } from "./rtc-uid";

type Member = { userId: string; rtcUids?: number[]; screenUids?: number[] };

/** Local RTC identity remains valid when a database heartbeat is delayed. */
export function classroomParticipantOwnerId(
  participant: { id: string; isLocal: boolean },
  members: readonly Member[],
  currentUserId: string,
): string {
  if (participant.isLocal && currentUserId) return currentUserId;
  const owner = members.find((member) =>
    member.rtcUids?.some((uid) => String(uid) === participant.id) ||
    member.screenUids?.some((uid) => String(uid) === participant.id) ||
    String(classroomRtcUid(member.userId, "camera")) === participant.id ||
    String(classroomRtcUid(member.userId, "screen")) === participant.id,
  );
  return owner?.userId || participant.id.replace(/::screen$/, "");
}
