import type { ClassroomSpaceSnapshot } from "./types";

/** Select only a currently available room; a student may use only their assigned room. */
export function classroomChatSpace(spaces: readonly ClassroomSpaceSnapshot[], activeSpaceId: string | null, role: string | undefined): string | null {
  if (role !== "teacher" && role !== "assistant" && role !== "student") return null;
  return spaces.find(space => space.id === activeSpaceId && space.status === "open" && (role !== "student" || space.isAssigned))?.id
    || spaces.find(space => space.isAssigned && space.status === "open")?.id
    || null;
}
