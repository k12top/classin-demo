export type ClassroomAccessRole = "teacher" | "assistant" | "student";

export const AGORA_CLASSROOM_ROLE_TYPE: Record<ClassroomAccessRole, number> = {
  teacher: 1,
  student: 2,
  assistant: 3,
};

export function isClassroomAccessRole(
  role: unknown
): role is ClassroomAccessRole {
  return role === "teacher" || role === "assistant" || role === "student";
}

export function agoraRoleTypeForClassroomRole(
  role: ClassroomAccessRole
): number {
  return AGORA_CLASSROOM_ROLE_TYPE[role];
}
