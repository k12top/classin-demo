import type {
  ClassroomCapabilities,
  ClassroomRole,
} from "@/lib/classroom/types";
import type { ClassroomModePolicy } from "@/lib/classroom/mode";
import { getFinishedDelayMinutes } from "@/lib/course-status";

export const classroomStageSeatLimit = 6;

export function classroomCapabilities(
  role: ClassroomRole,
  mode?: ClassroomModePolicy,
  // Assistants manage the classroom by default; an explicit revocation still applies.
  managementAllowed = true,
): ClassroomCapabilities {
  const teacher = role === "teacher";
  const teachingRole = teacher || (role === "assistant" && managementAllowed);
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
