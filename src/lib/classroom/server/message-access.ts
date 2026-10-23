import type { Prisma } from "@prisma/client";
/** The same visibility predicate protects listing and translating messages. */
export function classroomMessageAccess(sessionId: string, userId: string, role: string): Prisma.ClassroomMessageWhereInput {
  return { sessionId, OR: [
    { scope: "classroom" }, ...(role !== "student" ? [{ scope: "staff" }] : []),
    { scope: "direct", OR: [{ senderId: userId }, { recipientId: userId }] },
    { scope: "room", ...(role === "teacher" || role === "assistant" ? {} : { space: { members: { some: { userId, active: true } } } }) },
  ] };
}
