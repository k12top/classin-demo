"use client";

import { useState } from "react";
import { unreadChatCount, type ChatReadState } from "./chat-unread";
import type { ClassroomMessageSnapshot } from "./types";

export function useChatUnread(messages: readonly ClassroomMessageSnapshot[] | undefined, sessionId: string, userId: string, open: boolean) {
  const [readState, setReadState] = useState<ChatReadState & { messages?: readonly ClassroomMessageSnapshot[] }>({ sessionId: "", readIds: [] });
  // Adjust remembered inputs during render so opening/closing the drawer
  // cannot leave a one-frame stale badge or race the next incoming message.
  if (messages && (readState.sessionId !== sessionId || (open && readState.messages !== messages))) {
    setReadState({ sessionId, readIds: messages.map(message => message.id), messages });
  }
  return unreadChatCount(messages || [], readState, sessionId, userId, open);
}
