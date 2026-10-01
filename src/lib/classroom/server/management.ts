import "server-only";
import { prisma } from "@/lib/db";
import type { ClassroomRole } from "@/lib/classroom/types";
export async function canManageClassroom(sessionId: string, userId: string, role: ClassroomRole): Promise<boolean> {
  if (role === "teacher") return true;
  if (role !== "assistant") return false;
  const runtime = await prisma.classroomRuntime.findUnique({ where: { sessionId }, select: { assistantPermissions: true } });
  const permissions = runtime?.assistantPermissions as Record<string, boolean> | undefined;
  return permissions?.[userId] === true;
}
