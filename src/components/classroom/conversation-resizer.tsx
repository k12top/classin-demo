"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";

export function ConversationResizer({ open }: { open: boolean }) {
  const { t } = useTranslation();
  const element = useRef<HTMLDivElement>(null), preferred = useRef<number | null>(null);
  const [limits, setLimits] = useState({ min: 280, max: 480, value: 328, docked: false });
  useEffect(() => {
    const workspace = element.current?.parentElement; if (!workspace) return;
    try { const stored = Number(localStorage.getItem("classroom-conversation-width")); if (stored > 0) preferred.current = stored; } catch {}
    const update = () => {
      const width = workspace.clientWidth;
      const landscape = matchMedia("(min-width:640px) and (max-width:1024px) and (orientation:landscape)").matches;
      const docked = width > 760 || landscape, min = landscape ? 240 : 280;
      const max = Math.max(min, Math.floor(Math.min(480, width * .4))), normal = landscape ? 280 : width >= 1600 ? 352 : width >= 1200 ? 328 : 304;
      const value = Math.min(max, Math.max(min, preferred.current ?? normal));
      workspace.style.setProperty("--conversation-width", value + "px");
      workspace.parentElement?.style.setProperty("--conversation-width", value + "px");
      setLimits({ min, max, value, docked });
    };
    const observer = new ResizeObserver(update); observer.observe(workspace); update();
    return () => { observer.disconnect(); workspace.style.removeProperty("--conversation-width"); workspace.parentElement?.style.removeProperty("--conversation-width"); };
  }, []);
  const apply = (value: number | null) => {
    preferred.current = value;
    try { if (value === null) localStorage.removeItem("classroom-conversation-width"); else localStorage.setItem("classroom-conversation-width", String(value)); } catch {}
    const workspace = element.current?.parentElement; if (!workspace) return;
    const actual = Math.min(limits.max, Math.max(limits.min, value ?? (workspace.clientWidth >= 1600 ? 352 : workspace.clientWidth >= 1200 ? 328 : limits.min === 240 ? 280 : 304)));
    workspace.style.setProperty("--conversation-width", actual + "px"); workspace.parentElement?.style.setProperty("--conversation-width", actual + "px"); setLimits(current => ({ ...current, value: actual }));
  };
  return <div ref={element} role="separator" aria-orientation="vertical" aria-label={t("classroomSharing.resize")} aria-valuemin={limits.min} aria-valuemax={limits.max} aria-valuenow={limits.value} tabIndex={open && limits.docked ? 0 : -1} hidden={!open || !limits.docked} className="classroom-conversation-resizer" onDoubleClick={() => apply(null)}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = "true"; event.preventDefault(); }}
    onPointerMove={event => { if (event.currentTarget.dataset.dragging !== "true") return; const r=event.currentTarget.parentElement!.getBoundingClientRect(); apply(r.right-event.clientX-5); }}
    onPointerUp={event => { delete event.currentTarget.dataset.dragging; event.currentTarget.releasePointerCapture(event.pointerId); }}
    onLostPointerCapture={event => { delete event.currentTarget.dataset.dragging; }}
    onKeyDown={event => { const step = event.shiftKey ? 32 : 8; const next = event.key === "ArrowLeft" ? limits.value + step : event.key === "ArrowRight" ? limits.value - step : event.key === "Home" ? limits.min : event.key === "End" ? limits.max : null; if (next !== null) { event.preventDefault(); apply(next); } }} />;
}
