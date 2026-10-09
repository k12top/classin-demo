import type { ClassroomAction, ClassroomRuntimeSnapshot } from "./types";
import type { ClassroomMemberPermissionUpdate } from "./signaling/types";

export type ClassroomMicrophonePermissionAction = Extract<ClassroomAction,
  { type: "muteAllMicrophones" | "unmuteAllMicrophones" | "setMediaAllowed" }>;

export function isMicrophonePermissionAction(action: ClassroomAction): action is ClassroomMicrophonePermissionAction {
  return ["muteAllMicrophones", "unmuteAllMicrophones", "setMediaAllowed"].includes(action.type);
}

export function applyClassroomMemberPermissionUpdate(
  runtime: ClassroomRuntimeSnapshot,
  update: ClassroomMemberPermissionUpdate,
  publisherId?: string,
  trustedResponse = false,
): ClassroomRuntimeSnapshot | null {
  if (runtime.status === "ended" || !Number.isSafeInteger(update.revision) || update.revision <= runtime.revision ||
    typeof update.microphoneAllowed !== "boolean" ||
    (update.cameraAllowed !== undefined && typeof update.cameraAllowed !== "boolean") ||
    !["students", "member"].includes(update.scope) ||
    (update.scope === "member" && typeof update.targetUserId !== "string")) return null;
  const actor = runtime.members.find(member => member.userId === update.actorId);
  if (!trustedResponse && (!publisherId || !actor?.signalingUserIds?.includes(publisherId) ||
    !(actor.role === "teacher" || (actor.role === "assistant" && runtime.assistantPermissions?.[actor.userId] === true)))) return null;
  return {
    ...runtime, revision: update.revision,
    members: runtime.members.map(member =>
      (update.scope === "students" ? member.role === "student" : member.userId === update.targetUserId)
        ? { ...member, microphoneAllowed: update.microphoneAllowed,
          ...(update.cameraAllowed !== undefined && { cameraAllowed: update.cameraAllowed }) }
        : member),
  };
}
