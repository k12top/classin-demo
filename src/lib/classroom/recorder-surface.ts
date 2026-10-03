import { classroomRtcUid } from "./rtc-uid";
import type { ClassroomBoardItem, ClassroomMemberSnapshot, ClassroomParticipant } from "./types";

function cameraOwnerId(id: string, members: readonly ClassroomMemberSnapshot[]): string {
  return members.find((member) =>
    member.rtcUids?.some((uid) => String(uid) === id) ||
    String(classroomRtcUid(member.userId, "camera")) === id,
  )?.userId ?? id;
}

/** Cameras normally shown in the podium must be included in the recording. */
export function recorderCameraParticipants(
  participants: readonly ClassroomParticipant[],
  members: readonly ClassroomMemberSnapshot[],
  boardItems: readonly ClassroomBoardItem[],
  screenSharing: boolean,
) {
  const composed = new Set(boardItems.filter((item) => item.kind === "camera" && item.visible && !screenSharing).map((item) => item.sourceId));
  return participants.filter((participant) => {
    if (participant.isLocal || participant.kind !== "camera" || !participant.hasVideo) return false;
    const ownerId = cameraOwnerId(participant.id, members);
    const member = members.find((candidate) => candidate.userId === ownerId);
    return !composed.has(ownerId) && (!member || member.role !== "student" || member.onStage);
  }).sort((a, b) => {
    const roleOrder = (id: string) => {
      const member = members.find((candidate) => candidate.userId === cameraOwnerId(id, members));
      return member?.role === "teacher" ? 0 : member?.role === "assistant" ? 1 : 2;
    };
    return roleOrder(a.id) - roleOrder(b.id) || a.id.localeCompare(b.id);
  });
}

/** Connection alone is insufficient: the visible video must contain a frame. */
export function recorderVideosHaveFrames(root: HTMLElement): boolean {
  const surfaces = Array.from(root.querySelectorAll<HTMLElement>('[data-media-video="true"]'))
    .filter((surface) => {
      const rect = surface.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  return surfaces.every((surface) => {
    const video = surface.querySelector("video");
    return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
  });
}
