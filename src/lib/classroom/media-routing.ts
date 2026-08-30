import type {
  ClassroomMediaSnapshot,
  ClassroomParticipant,
} from "@/lib/classroom/types";

export type ClassroomScreenShareSource = "main" | "room";

export type ActiveClassroomScreenShare = {
  participant: ClassroomParticipant;
  source: ClassroomScreenShareSource;
};

/**
 * The presenter already sees the selected desktop in the operating system.
 * Hiding the local RTC preview avoids a distracting recursive mirror, while
 * viewers and the recorder still render the published screen track.
 */
export function shouldHideLocalScreenSharePreview(
  share: ActiveClassroomScreenShare | null,
  recorder: boolean,
) {
  return Boolean(share?.participant.isLocal && !recorder);
}

export function selectActiveScreenShare({
  main,
  room,
  preferRoom,
  mainScreenUserId,
  roomScreenUserId,
}: {
  main: ClassroomMediaSnapshot;
  room: ClassroomMediaSnapshot;
  preferRoom: boolean;
  mainScreenUserId?: string | null;
  roomScreenUserId?: string | null;
}): ActiveClassroomScreenShare | null {
  const findScreen = (
    snapshot: ClassroomMediaSnapshot,
    source: ClassroomScreenShareSource,
  ): ActiveClassroomScreenShare | null => {
    const participant = snapshot.participants.find(
      (candidate) => candidate.kind === "screen" && candidate.hasVideo,
    );
    return participant ? { participant, source } : null;
  };

  const localScreen = (
    snapshot: ClassroomMediaSnapshot,
    source: ClassroomScreenShareSource,
    userId?: string | null,
  ): ActiveClassroomScreenShare | null =>
    snapshot.local.screenSharing && userId
      ? {
          source,
          participant: {
            id: userId,
            displayName: userId,
            isLocal: true,
            kind: "screen",
            hasAudio: false,
            hasVideo: true,
          },
        }
      : null;

  const mainShare = findScreen(main, "main");
  if (!preferRoom) {
    return mainShare || localScreen(main, "main", mainScreenUserId);
  }

  return (
    findScreen(room, "room") ||
    localScreen(room, "room", roomScreenUserId) ||
    mainShare ||
    localScreen(main, "main", mainScreenUserId)
  );
}
