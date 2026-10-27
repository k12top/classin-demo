import type {
  ClassroomAction,
  ClassroomEngagementSnapshot,
  ClassroomRuntimeSnapshot,
} from "./types";
import type { ClassroomMemberPermissionUpdate, ClassroomScreenShareRequest, ClassroomHandRaiseUpdate } from "./signaling/types";
import { isMicrophonePermissionAction } from "./member-permissions";

export function classroomActionRequiresRevision(action: ClassroomAction) {
  return [
    "placeBoardItem", "bringBoardItemToFront",
    "arrangeVideoGallery", "reorderSeats", "swapSeats",
  ].includes(action.type);
}

export function classroomActionCanRetry(action: ClassroomAction) {
  // Repeating absolute settings is safe; incrementing rewards or rounds is not.
  return [
    "setMediaAllowed", "muteAllMicrophones", "unmuteAllMicrophones",
    "setMemberMuted", "muteAll", "setWhiteboardWritable",
    "setAssistantPermission", "setStageSettings", "setChatEnabled", "setRecordingStartMode", "setClassStartMode", "setCaptionStartPreferences", "startScheduledClass",
    "setInterpretation", "deauthorizeAll", "releaseScreenShare",
    "raiseHand", "lowerHand", "acknowledgeHand", "removeBoardItem", "resetComposition",
  ].includes(action.type);
}

export type ClassroomActionResult = {
  error?: string;
  code?: string;
  runtime?: ClassroomRuntimeSnapshot;
  engagement?: ClassroomEngagementSnapshot;
  memberPermissions?: ClassroomMemberPermissionUpdate;
  screenShareRequest?: ClassroomScreenShareRequest;
  handRaise?: ClassroomHandRaiseUpdate;
};

export async function requestClassroomAction(
  url: string,
  body: {
    action: ClassroomAction;
    expectedRevision?: number;
    clientId: string;
    commandId?: string;
    shareAccess?: string;
  },
  fetcher: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
  signal?: AbortSignal,
) {
  const { expectedRevision, ...rest } = body;
  const requestBody = {
    ...rest,
    commandId: body.commandId || globalThis.crypto.randomUUID(),
    ...(isMicrophonePermissionAction(body.action) && { compactMemberPermissions: true }),
    ...(body.action.type === "requestScreenShare" && { compactScreenShareRequest: true }),
    ...(["raiseHand", "lowerHand"].includes(body.action.type) && { compactHandRaise: true }),
    ...(classroomActionRequiresRevision(body.action) &&
      expectedRevision !== undefined ? { expectedRevision } : {}),
  };
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const response = await fetcher(url, {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const payload = await response.json() as ClassroomActionResult;
    if (
      response.status === 503 &&
      payload.code === "database_unavailable" &&
      classroomActionCanRetry(body.action) && attempt < 2
    ) {
      await wait(2_000 * (attempt + 1));
      continue;
    }
    return { response, payload };
  }
}
