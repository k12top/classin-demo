"use client";
import { ClassroomIconButton } from "./icon-button";

import { useEffect, useRef } from "react";
import { MonitorUp, PanelsTopLeft, CircleStop, X, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { PORTRAIT_BORDER_COLORS, PORTRAIT_DEFAULT_SIZE, PORTRAIT_MIN_SIZE } from "@/lib/classroom/share-portrait";
import type { ClassroomScreenShareOptions } from "@/lib/classroom/types";

export function ScreenShareMenu({ open, sharing, supported, options, busy, onSelect, onOptionsChange, onStop, onClose }: {
  open: boolean; sharing: boolean; supported: boolean; options: ClassroomScreenShareOptions; busy: boolean;
  onSelect: (options: ClassroomScreenShareOptions) => void; onOptionsChange: (options: ClassroomScreenShareOptions) => void; onStop: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); previous?.focus(); } };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape, true); };
  }, [onClose, open]);
  if (!open) return null;
  return <div ref={root} className="classroom-share-menu" role="dialog" aria-label={t("classroomSharing.title")}>
    <header><span>{t("classroomSharing.title")}</span><ClassroomIconButton type="button" aria-label={t("classroom.v3.collapsePanel")} onClick={onClose}><X /></ClassroomIconButton></header>
    {(["screen", "portrait"] as const).map(mode => <ClassroomIconButton type="button" key={mode} disabled={busy || (mode === "portrait" && !supported)} aria-pressed={sharing && options.mode === mode} onClick={() => onSelect({ ...options, mode })}>
      {mode === "screen" ? <MonitorUp /> : <PanelsTopLeft />}<span>{t(mode === "screen" ? "classroomSharing.screen" : "classroomSharing.portrait")}</span>{sharing && options.mode === mode && <Check />}
    </ClassroomIconButton>)}
    {!supported && <p>{t("classroomSharing.unsupported")}</p>}
    {sharing && options.mode === "portrait" && <><span className="classroom-share-corner-label">{t("classroomSharing.position")}</span><div className="classroom-share-corners">{(["tl", "tr", "bl", "br"] as const).map(corner => <ClassroomIconButton key={corner} type="button" disabled={busy} aria-pressed={(options.corner ?? "br") === corner} aria-label={t(`classroomSharing.${corner}`)} title={t(`classroomSharing.${corner}`)} onClick={() => onOptionsChange({ ...options, corner })}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><circle cx={corner.endsWith("r") ? 17 : 7} cy={corner.startsWith("t") ? 9 : 15} r="2.5" fill="currentColor" /></svg></ClassroomIconButton>)}</div><div className="classroom-share-appearance">
      <label><span>{t("classroomSharing.size")}</span><input type="range" aria-label={t("classroomSharing.size")} min={PORTRAIT_MIN_SIZE} max={PORTRAIT_DEFAULT_SIZE} step={4} value={options.portraitSize ?? PORTRAIT_DEFAULT_SIZE} disabled={busy} onChange={event => onOptionsChange({ ...options, portraitSize: Number(event.target.value) })} /><output>{Math.round((options.portraitSize ?? PORTRAIT_DEFAULT_SIZE) / PORTRAIT_DEFAULT_SIZE * 100)}%</output></label>
      <label><span>{t("classroomSharing.border")}</span><select aria-label={t("classroomSharing.border")} value={options.portraitBorder ?? "solid"} disabled={busy} onChange={event => onOptionsChange({ ...options, portraitBorder: event.target.value as ClassroomScreenShareOptions["portraitBorder"] })}>{(["none", "solid", "double"] as const).map(style => <option key={style} value={style}>{t(`classroomSharing.border_${style}`)}</option>)}</select></label>
      {options.portraitBorder !== "none" && <div className="classroom-share-border-colors" role="group" aria-label={t("classroomSharing.borderColor")}>{(Object.entries(PORTRAIT_BORDER_COLORS) as [keyof typeof PORTRAIT_BORDER_COLORS, string][]).map(([color, hex]) => <ClassroomIconButton type="button" key={color} disabled={busy} style={{ background: hex }} title={t(`classroomSharing.color_${color}`)} aria-label={t(`classroomSharing.color_${color}`)} aria-pressed={(options.portraitBorderColor ?? "white") === color} onClick={() => onOptionsChange({ ...options, portraitBorderColor: color })} />)}</div>}
    </div></>}
    {sharing && <ClassroomIconButton type="button" disabled={busy} className="is-danger" onClick={onStop}><CircleStop /><span>{t("classroom.v3.stopSharing")}</span></ClassroomIconButton>}
  </div>;
}
