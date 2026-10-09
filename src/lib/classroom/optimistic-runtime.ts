import { arrangeClassroomVideoGallery, emptyClassroomComposition } from "./composition";
import type { ClassroomAction, ClassroomRuntimeSnapshot } from "./types";
// Pure UI preview; the server remains authoritative and failed requests reload it.
export function optimisticClassroomRuntime(runtime: ClassroomRuntimeSnapshot, action: ClassroomAction, actorId: string): ClassroomRuntimeSnapshot | null {
 const patchMember = (userId: string, patch: Partial<ClassroomRuntimeSnapshot["members"][number]>) => ({ ...runtime, members: runtime.members.map((member) => member.userId === userId ? { ...member, ...patch } : member) });
 switch (action.type) {
  case "setRecordingStartMode": return { ...runtime, recordingStartMode: action.mode };
  case "setWhiteboardWritable": return patchMember(action.targetUserId, { whiteboardWritable: action.writable });
  case "setMediaAllowed": return patchMember(action.targetUserId, { microphoneAllowed: action.microphoneAllowed, cameraAllowed: action.cameraAllowed });
  case "setMemberMuted": return patchMember(action.targetUserId, { chatMuted: action.muted });
  case "raiseHand": return patchMember(actorId, { handRaisedAt: new Date().toISOString() });
  case "lowerHand": return patchMember(actorId, { handRaisedAt: null });
  case "inviteStage": return patchMember(action.targetUserId, { stageState: "invited" });
  case "removeStage": return patchMember(action.targetUserId, { onStage: false, stageState: "offstage", whiteboardWritable: false });
  case "arrangeVideoGallery": return { ...runtime, composition: arrangeClassroomVideoGallery(runtime.composition, runtime.members.filter(member => member.online && (member.role !== "student" || member.onStage))) };
  case "resetComposition": return { ...runtime, composition: { ...emptyClassroomComposition(), screenShares: runtime.composition.screenShares } };
  case "startTimer": return { ...runtime, timerStartedAt: new Date().toISOString(), timerPausedAt: null, timerDurationSec: action.durationSec };
  case "resetTimer": return { ...runtime, timerStartedAt: null, timerPausedAt: null, timerDurationSec: null };
  // Rewards are celebrated only after the server confirms the award.
  case "giveReward": return null;
  case "muteAll": return { ...runtime, members: runtime.members.map(member => member.role === "student" ? { ...member, chatMuted: action.muted } : member) };
  case "unmuteAllMicrophones": return { ...runtime, members: runtime.members.map(member => member.role === "student" ? { ...member, microphoneAllowed: true } : member) };
  case "muteAllMicrophones": return { ...runtime, members: runtime.members.map(member => member.role === "student" ? { ...member, microphoneAllowed: false } : member) };
  case "authorizeAllOnStage": return { ...runtime, members: runtime.members.map(member => member.role === "student" && member.onStage ? { ...member, whiteboardWritable: true } : member) };
  case "deauthorizeAll": return { ...runtime, members: runtime.members.map(member => member.role === "student" ? { ...member, whiteboardWritable: false } : member) };
  case "removeAllStudentsFromStage": return { ...runtime, members: runtime.members.map(member => member.role === "student" ? { ...member, onStage: false, stageState: "offstage", whiteboardWritable: false } : member) };
  case "setChatEnabled": return { ...runtime, chatEnabled: action.enabled };
  case "setStage": return { ...runtime, stageMode: action.mode, stageLocked: action.locked, activeCoursewareId: action.coursewareId ?? runtime.activeCoursewareId };
  case "setInterpretation": return { ...runtime, interpretation: { ...runtime.interpretation, enabled: action.enabled, provider: action.provider, sourceLanguage: action.sourceLanguage, targetLanguages: action.targetLanguages, status: action.enabled ? "starting" : "stopping", error: null } };
  case "setAssistantPermission": return { ...runtime, assistantPermissions: { ...runtime.assistantPermissions, [action.targetUserId]: action.allowed } };
  default: return null;
 }
}
