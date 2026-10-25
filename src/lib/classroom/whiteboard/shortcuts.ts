import type { ClassroomWhiteboardController, ClassroomWhiteboardTool } from "@/components/classroom/fastboard-surface";

const TOOL_KEYS: Record<string, ClassroomWhiteboardTool> = { v: "selector", h: "clicker", p: "pencil", l: "straight", a: "arrow", r: "rectangle", o: "ellipse", t: "text", e: "eraser", k: "laserPointer" };
const EDITABLE = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[role="alertdialog"],[role="menu"]';
function closest(target: EventTarget | null, selector: string) {
  return Boolean((target as Element | null)?.closest?.(selector));
}

/** One temporary modifier owns one gesture, restored on key-up, pointer-up or blur. */
export function createWhiteboardShortcuts({ controller, getTool, selectTool, allowPan = true, nativeHistory = true }: {
  controller: ClassroomWhiteboardController;
  getTool: () => ClassroomWhiteboardTool;
  selectTool: (tool: ClassroomWhiteboardTool) => void;
  allowPan?: boolean;
  nativeHistory?: boolean;
}) {
  let temporary: { key: "Shift" | "Space"; previous: ClassroomWhiteboardTool } | null = null;
  let drawing = false, released = false;
  const choose = (tool: ClassroomWhiteboardTool) => { controller.setTool(tool); selectTool(tool); };
  const restore = () => { const old = temporary; temporary = null; released = false; if (old) choose(old.previous); };
  const begin = (key: "Shift" | "Space", tool: ClassroomWhiteboardTool) => {
    if (temporary) return;
    temporary = { key, previous: getTool() }; choose(tool);
  };
  return {
    keydown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || closest(event.target, EDITABLE)) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (!nativeHistory && (key === "z" || key === "y") && !event.altKey) {
          event.preventDefault(); event.stopPropagation();
          if (key === "y" || event.shiftKey) controller.redo(); else controller.undo();
        }
        return;
      }
      if (event.altKey) return;
      if (event.key === "Shift" && getTool() === "pencil" && !drawing) {
        begin("Shift", "straight"); event.stopPropagation(); return;
      }
      if ((event.code === "Space" || event.key === " ") && allowPan && !drawing && !closest(event.target, 'button,a,[role="button"]')) {
        event.preventDefault(); event.stopPropagation(); begin("Space", "clicker"); return;
      }
      if (!nativeHistory && (event.key === "Delete" || event.key === "Backspace") && controller.deleteSelection) {
        event.preventDefault(); event.stopPropagation(); controller.deleteSelection(); return;
      }
      const tool = TOOL_KEYS[key];
      if (!tool || drawing || (tool === "clicker" && !allowPan)) return;
      event.preventDefault(); event.stopPropagation(); temporary = null; released = false; choose(tool);
    },
    keyup(event: KeyboardEvent) {
      if (!temporary || (temporary.key === "Shift" ? event.key !== "Shift" : event.code !== "Space" && event.key !== " ")) return;
      if (drawing) released = true; else restore();
    },
    pointerdown(event: PointerEvent) {
      if (event.button !== 0 || !closest(event.target, '.classroom-v3-board-canvas,.classroom-v3-screen-annotations')) return;
      if (event.shiftKey && getTool() === "pencil") begin("Shift", "straight");
      drawing = true;
    },
    pointerup() {
      drawing = false;
      // Let the SDK commit the final point before restoring the pencil appliance.
      if (released) setTimeout(() => { if (!drawing && released) restore(); }, 0);
    },
    blur() { drawing = false; restore(); },
  };
}
