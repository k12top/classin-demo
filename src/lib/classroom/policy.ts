import type {
  ClassroomCapabilities,
  ClassroomRole,
} from "@/lib/classroom/types";
import type { ClassroomModePolicy } from "@/lib/classroom/mode";
import { getFinishedDelayMinutes } from "@/lib/course-status";

export function isClassroomTeachingRole(role: string | undefined): boolean {
  return role === "teacher" || role === "assistant";
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
