"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";

type Position = { x: number; y: number };
type Drag = {
  pointerId: number; startX: number; startY: number; origin: Position;
  scaleX: number; scaleY: number; moved: boolean;
};

function constrain(point: Position, bounds: HTMLElement, widget: HTMLElement, open: boolean): Position {
  // An expanded panel uses the room below its title bar. Leave enough room
  // for the composer and a useful scroll area when the title is moved down.
  const height = bounds.clientHeight;
  const requiredHeight = open ? Math.min(360, height) : widget.offsetHeight;
  return {
    x: Math.max(0, Math.min(point.x, bounds.clientWidth - widget.offsetWidth)),
    y: Math.max(0, Math.min(point.y, height - requiredHeight)),
  };
}

export function useAssistantPosition(open: boolean, minimized: boolean) {
  const bounds = useRef<HTMLDivElement>(null);
  const widget = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const container = bounds.current;
    const element = widget.current;
    if (!container || !element) return;
    const observer = new ResizeObserver(() => {
      setPosition((previous) => {
        if (!previous) return previous;
        const next = constrain(previous, container, element, open);
        return next.x === previous.x && next.y === previous.y ? previous : next;
      });
    });
    observer.observe(container);
    observer.observe(element);
    const finish = () => { drag.current = null; setDragging(false); };
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (event.buttons === 0) { finish(); return; }
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.moved && Math.hypot(dx, dy) < 5) return;
      current.moved = true;
      suppressClick.current = true;
      setDragging(true);
      setPosition(constrain({ x: current.origin.x + dx * current.scaleX, y: current.origin.y + dy * current.scaleY }, container, element, open));
    };
    const release = (event: PointerEvent) => { if (drag.current?.pointerId === event.pointerId) finish(); };
    // Keep following the pointer when it leaves the handle or browser viewport.
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", finish);
    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", finish);
    };
  }, [open, minimized]);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0 || !widget.current || !bounds.current) return;
    const button = (event.target as Element).closest("button");
    // Header actions and dock controls keep their ordinary click behaviour.
    if (button && !button.hasAttribute("data-assistant-move")) return;
    const rect = bounds.current.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      origin: { x: widget.current.offsetLeft, y: widget.current.offsetTop },
      scaleX: rect.width ? bounds.current.clientWidth / rect.width : 1,
      scaleY: rect.height ? bounds.current.clientHeight / rect.height : 1,
      moved: false,
    };
    suppressClick.current = false;
    (button || event.currentTarget).setPointerCapture(event.pointerId);
  };
  const captureClick = (event: MouseEvent<HTMLElement>) => {
    if (!suppressClick.current || event.detail === 0) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const capturePointerDown = () => { suppressClick.current = false; };
  const moveWithKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
      return;
    }
    const direction: Record<string, Position> = {
      ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    };
    const delta = direction[event.key];
    if (!delta || !widget.current || !bounds.current) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 40 : 10;
    setPosition(constrain({ x: widget.current.offsetLeft + delta.x * step, y: widget.current.offsetTop + delta.y * step }, bounds.current, widget.current, open));
  };

  const style: CSSProperties | undefined = position ? { left: position.x, top: position.y, bottom: open ? 0 : "auto" } : undefined;
  return { bounds, widget, style, dragging, startDrag, captureClick, capturePointerDown, moveWithKeys };
}
