export type ClassroomAssistantMessage = { role: "user" | "assistant"; content: string };
export const ASSISTANT_QUESTION_LIMIT = 2_000;
export const ASSISTANT_HISTORY_LIMIT = 12;

/** Resolve only the canonical lead teacher; an assistant or student is never a fallback. */
export function classroomAssistantTeacher(
  course: { teacherId?: string; teacherName: string; teacherAvatar?: string },
  members: Array<{ userId: string; displayName: string; avatar: string; role: string }>,
) {
  const identity = (id: string) => id.trim().split("/").at(-1)?.toLowerCase();
  const lead = course.teacherId
    ? members.find((member) => member.role === "teacher" && identity(member.userId) === identity(course.teacherId!))
    : members.find((member) => member.role === "teacher");
  return {
    name: lead?.displayName || course.teacherName,
    avatar: lead?.avatar || course.teacherAvatar || "",
  };
}

export function assistantConversationKey(sessionId: string, userId: string) {
  return JSON.stringify([sessionId, userId]);
}
