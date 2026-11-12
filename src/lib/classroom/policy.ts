import type {
  ClassroomCapabilities,
  ClassroomMemberRole,
  ClassroomRole,
} from "@/lib/classroom/types";
import type { ClassroomModePolicy } from "@/lib/classroom/mode";
import { getFinishedDelayMinutes } from "@/lib/course-status";

export function isClassroomTeachingRole(role: string | undefined): boolean {
  return role === "teacher" || role === "assistant";
}

/** Teachers and assistants may speak while student chat is muted. */
export function classroomMaySendChat(role: string | undefined, chatEnabled: boolean, chatMuted: boolean): boolean {
  return isClassroomTeachingRole(role) || (role === "student" && chatEnabled && !chatMuted);
}

/** Do not expose unsupported persisted roles as students in runtime snapshots. */
export function isSupportedClassroomMember<T extends {role:string}>(member:T):member is T & {role:ClassroomMemberRole} {
  return member.role === "teacher" || member.role === "assistant" || member.role === "student" || member.role === "observer";
}

/** Observers may maintain presence but cannot mutate classroom state. */
export function classroomRoleMayAct(role:ClassroomRole,action:string):boolean {
  return role !== "observer" || action === "heartbeat";
}

/** Unrecognized or read-only roles must never receive publishing credentials. */
export function classroomMayPublish(role:string,requested?:boolean):boolean {
  if (isClassroomTeachingRole(role)) return requested !== false;
  return role === "student" && requested === true;
}

export function classroomMayWriteWhiteboard(role:string,requested:boolean):boolean {
  return isClassroomTeachingRole(role) || (role === "student" && requested);
}

export const classroomStageSeatLimit = 30;

export function classroomCapabilities(
  role: ClassroomRole,
  mode?: ClassroomModePolicy,
  // The assistant role itself grants the same classroom management capabilities.
  _managementAllowed = true,
): ClassroomCapabilities {
  const teacher = isClassroomTeachingRole(role);
  const teachingRole = teacher;
  const interactive = mode?.mode !== "publicLive";
  return {
    canStartClass: teacher,
    canEndClass: teacher,
    canControlRecording: teacher,
    canManageStage: teachingRole,
    canManageMembers: teachingRole,
    canManageChat: teachingRole,
    canManageWhiteboard: teachingRole,
    canManageInterpretation: teacher,
    canShareScreen: teachingRole,
    canGiveReward: teachingRole && interactive,
    canRunEngagement: teachingRole && interactive,
    canParticipateInEngagement: role === "student" && interactive,
  };
}

export function classroomGraceEndAt(
  endTime: Date | null,
  delayMinutes = getFinishedDelayMinutes(),
): Date | null {
  if (!endTime) return null;
  return new Date(endTime.getTime() + delayMinutes * 60 * 1000);
}
