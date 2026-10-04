"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClassroomEventEmitter, normalizeParentOrigin } from "./integration-events";
import type { ClassroomSessionResponse } from "./types";

export function useClassroomHostEvents(parentOrigin: string | null, disabled: boolean) {
  const target = useRef<string | undefined>(undefined);
  const emitter = useRef<ReturnType<typeof createClassroomEventEmitter> | null>(null);
  const getEmitter = useCallback(() => {
    if (!emitter.current) emitter.current = createClassroomEventEmitter((event) => {
      if (!disabled && window.parent !== window && target.current) window.parent.postMessage(event, target.current);
    });
    return emitter.current;
  }, [disabled]);

  useEffect(() => {
    if (disabled || window.parent === window) return;
    const explicit = normalizeParentOrigin(parentOrigin);
    target.current = explicit || normalizeParentOrigin(document.referrer);
    const subscribe = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "classroom.subscribe" || !normalizeParentOrigin(event.origin)) return;
      if (explicit && event.origin !== explicit) return;
      target.current = event.origin;
      getEmitter().replay();
    };
    window.addEventListener("message", subscribe);
    // No identity or course data is included in this discovery message.
    window.parent.postMessage({ source: "classroom", version: 1, type: "classroom.ready" }, explicit || "*");
    return () => window.removeEventListener("message", subscribe);
  }, [disabled, getEmitter, parentOrigin]);

  const emit = useCallback((session: ClassroomSessionResponse | null, reason: string, leaving = false) => {
    if (disabled || !session) return;
    const input = {
      courseId: session.course.id, sessionId: session.course.sessionId,
      courseStatus: session.course.status, classroomStatus: session.runtime.status,
      startedAt: session.runtime.startedAt, reason, occurredAt: new Date().toISOString(),
      actor: { userId: session.credential.userId, role: session.credential.role },
    };
    if (leaving) getEmitter().leave(input);
    else getEmitter().observe(input);
  }, [disabled, getEmitter]);
  return emit;
}
