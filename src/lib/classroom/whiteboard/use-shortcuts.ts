"use client";
import { useEffect, useRef } from "react";
import type { ClassroomWhiteboardController, ClassroomWhiteboardTool } from "@/components/classroom/fastboard-surface";
import { createWhiteboardShortcuts } from "./shortcuts";

export function useWhiteboardShortcuts(controller: ClassroomWhiteboardController | null, tool: ClassroomWhiteboardTool, onTool: (tool: ClassroomWhiteboardTool) => void, enabled: boolean, allowPan: boolean) {
  const current = useRef(tool);
  useEffect(() => { current.current = tool; }, [tool]);
  useEffect(() => {
    if (!enabled || !controller) return;
    const handlers = createWhiteboardShortcuts({ controller, getTool: () => current.current, selectTool: next => { current.current = next; onTool(next); }, allowPan, nativeHistory: allowPan });
    document.addEventListener("keydown", handlers.keydown, true);
    document.addEventListener("keyup", handlers.keyup, true);
    document.addEventListener("pointerdown", handlers.pointerdown, true);
    document.addEventListener("pointerup", handlers.pointerup, true);
    document.addEventListener("pointercancel", handlers.pointerup, true);
    window.addEventListener("blur", handlers.blur);
    return () => {
      document.removeEventListener("keydown", handlers.keydown, true);
      document.removeEventListener("keyup", handlers.keyup, true);
      document.removeEventListener("pointerdown", handlers.pointerdown, true);
      document.removeEventListener("pointerup", handlers.pointerup, true);
      document.removeEventListener("pointercancel", handlers.pointerup, true);
      window.removeEventListener("blur", handlers.blur);
      handlers.blur();
    };
  }, [controller, enabled, allowPan, onTool]);
}
