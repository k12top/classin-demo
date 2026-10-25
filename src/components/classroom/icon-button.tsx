"use client";

import { forwardRef, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";

/** One visible name for mouse and keyboard; the portal never gets clipped by a pane. */
export const ClassroomIconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function ClassroomIconButton({ title, children, onFocus, onBlur, onPointerEnter, onPointerLeave, onKeyDown, onClick, ...props }, ref) {
  const id = useId(), anchor = useRef<HTMLButtonElement | null>(null), tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false), [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const label = title || props["aria-label"];
  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect(), b = tip.current.getBoundingClientRect();
    setPosition({ x: Math.max(8, Math.min(innerWidth - b.width - 8, a.left + (a.width - b.width) / 2)), y: a.top >= b.height + 16 ? a.top - b.height - 8 : Math.min(innerHeight - b.height - 8, a.bottom + 8) });
    const close = () => setOpen(false);
    window.addEventListener("resize", close); window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [open, label]);
  return <><button {...props} ref={node => { anchor.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }} aria-label={props["aria-label"] || title} aria-describedby={[props["aria-describedby"], open && label ? id : null].filter(Boolean).join(" ") || undefined}
    onFocus={event => { setOpen(true); onFocus?.(event); }} onBlur={event => { setOpen(false); onBlur?.(event); }}
    onPointerEnter={event => { if (event.pointerType !== "touch") setOpen(true); onPointerEnter?.(event); }}
    onPointerLeave={event => { if (document.activeElement !== event.currentTarget) setOpen(false); onPointerLeave?.(event); }}
    onKeyDown={event => { if (event.key === "Escape") setOpen(false); onKeyDown?.(event); }} onClick={event => { setOpen(false); onClick?.(event); }}>{children}</button>
    {open && label && createPortal(<span ref={tip} id={id} role="tooltip" className="classroom-icon-tooltip" style={{ left: position?.x ?? 0, top: position?.y ?? 0, visibility: position ? "visible" : "hidden" }}>{label}</span>, document.body)}</>;
});
