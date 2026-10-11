import type { ClassroomMessageSnapshot } from "./types";

export type ChatReadState = { sessionId: string; readIds: readonly string[] };

export function unreadChatCount(messages: readonly ClassroomMessageSnapshot[], state: ChatReadState, sessionId: string, userId: string, open: boolean) {
  if (open || state.sessionId !== sessionId) return 0;
  const read = new Set(state.readIds);
  return messages.filter(message => message.senderId !== userId && !read.has(message.id)).length;
}
