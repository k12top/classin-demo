import "server-only";
import { isClassroomTeachingRole } from "../policy";
import type { ClassroomRole } from "../types";
// Callers first resolve authenticated lesson membership; platform roles are not enough.
export async function canManageClassroom(_sessionId: string, _userId: string, role: ClassroomRole): Promise<boolean> {
  return isClassroomTeachingRole(role);
}
