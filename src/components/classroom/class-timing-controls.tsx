"use client";
import { useRef, useState } from "react";
import { ClockPlus, Loader2, RotateCcw } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/lib/i18n/context";
export type ClassTiming = { startTime: string; endTime: string; revision: number };
export function ClassTimingControls({ courseId, sessionId, ended, onExtended, onRestarted, inMenu = false }: {
  courseId: string; sessionId: string; ended: boolean; onExtended?: (timing: ClassTiming) => void; onRestarted?: () => void; inMenu?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [open, setOpen] = useState(false);
  const lock = useRef(false), attempt = useRef<{ key: string; commandId: string } | null>(null);
  async function change(action: "reopen" | "extend", minutes?: number) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const key = `${action}:${minutes || 0}`;
    if (attempt.current?.key !== key) attempt.current = { key, commandId: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}/sessions/${encodeURIComponent(sessionId)}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, minutes, commandId: attempt.current.commandId }), signal: AbortSignal.timeout(20_000) });
      const result = await response.json();
      if (!response.ok || !result.timing) throw new Error(result.error || t("classroomUpdates.lifecycleFailed"));
      attempt.current = null;
      setOpen(false);
      if (action === "reopen") (onRestarted || (() => window.location.reload()))();
      else onExtended?.(result.timing);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("classroomUpdates.lifecycleFailed")); }
    finally { lock.current = false; setBusy(false); }
  }
  function handleExtend(event: Event) {
    event.preventDefault();
    void change("extend", Number((event.currentTarget as HTMLElement).dataset.minutes));
  }
  const icon = busy ? <Loader2 className="animate-spin" /> : ended ? <RotateCcw /> : <ClockPlus />;
  const items = <>
      {ended ? <><p>{t("classroomUpdates.restartHint")}</p><DropdownMenuItem disabled={busy} onSelect={event => { event.preventDefault(); void change("reopen"); }}><RotateCcw />{t("classroomUpdates.restartConfirm")}</DropdownMenuItem></>
        : [15, 30, 60].map(minutes => <DropdownMenuItem key={minutes} disabled={busy} data-minutes={minutes} onSelect={handleExtend}><ClockPlus />{t("classroomUpdates.extendMinutes", { minutes })}</DropdownMenuItem>)}
      {error && <p role="alert">{error}</p>}
    </>;
  if (inMenu) return <DropdownMenuSub open={open} onOpenChange={setOpen}>
    <DropdownMenuSubTrigger disabled={busy} className="classroom-timing-subtrigger">{icon}<span>{t(ended ? "classroomUpdates.restart" : "classroomUpdates.extend")}</span></DropdownMenuSubTrigger>
    <DropdownMenuPortal><DropdownMenuSubContent collisionPadding={8} sideOffset={4} className="classroom-header-menu classroom-header-submenu classroom-v3-class-controls-menu">{items}</DropdownMenuSubContent></DropdownMenuPortal>
  </DropdownMenuSub>;
  return <DropdownMenu open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger asChild><button type="button" className="classroom-v3-class-controls" aria-label={t("classroomUpdates.courseControls")}>{icon}<span>{t(ended ? "classroomUpdates.restart" : "classroomUpdates.extend")}</span></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="classroom-v3-class-controls-menu">{items}</DropdownMenuContent>
  </DropdownMenu>;
}
