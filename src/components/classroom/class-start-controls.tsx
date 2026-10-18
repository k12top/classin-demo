"use client";

import { useEffect, useRef } from "react";
import { Clock3, Radio, Settings2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { classStartLateness, normalizeClassStartMode, type ClassStartMode } from "@/lib/classroom/class-start";
import type { ClassroomRole, ClassroomRuntimeSnapshot } from "@/lib/classroom/types";
import styles from "./class-start-controls.module.css";

export function ClassStartSettings({ runtime, busy, reveal = false, onChange }: {
  runtime: ClassroomRuntimeSnapshot; busy: boolean; reveal?: boolean; onChange: (mode: ClassStartMode) => void;
}) {
  const { t } = useTranslation();
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!reveal) return;
    const timer = window.setTimeout(() => {
      selectRef.current?.closest("fieldset")?.scrollIntoView({ block: "start" });
      selectRef.current?.focus({ preventScroll: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [reveal]);
  return <fieldset className="classroom-v3-caption-settings classroom-v3-start-policy">
    <legend>{t("classroom.v3.startPolicyTitle")}</legend>
    <label>
      <span>{t("classroom.v3.startPolicyLabel")}</span>
      <select ref={selectRef} aria-label={t("classroom.v3.startPolicyTitle")} value={normalizeClassStartMode(runtime.classStartMode)}
        disabled={busy || runtime.status !== "waiting"} onChange={event => onChange(event.target.value as ClassStartMode)}>
        <option value="manual">{t("classroom.v3.startPolicyManual")}</option>
        <option value="scheduled">{t("classroom.v3.startPolicyScheduled")}</option>
      </select>
    </label>
    <p>{t(runtime.status === "waiting" ? "classroom.v3.startPolicyHint" : "classroom.v3.startPolicyLocked")}</p>
  </fieldset>;
}

export function ClassStartReminder({ role, status, mode, startTime, endTime, now, busy, onStart, onSettings }: {
  role: ClassroomRole; status: string; mode?: ClassStartMode;
  startTime: string | null; endTime: string | null; now: number; busy: boolean;
  onStart: () => void; onSettings: () => void;
}) {
  const { t } = useTranslation();
  const minutes = classStartLateness(startTime, now);
  if ((role !== "teacher" && role !== "assistant") || status !== "waiting" || minutes === null ||
    (endTime && now >= Date.parse(endTime))) return null;
  const automatic = mode === "scheduled", teacher = role === "teacher";
  return <aside className={styles.reminder} aria-label={t("classroom.v3.classStartDue")}>
    <div className={styles.heading}><Clock3 aria-hidden="true" /><strong role="status">
      {t(minutes ? "classroom.v3.classStartLate" : "classroom.v3.classStartDue", { minutes })}
    </strong></div>
    <p>{t(automatic ? "classroom.v3.classStartAutoHint" : teacher ? "classroom.v3.classStartManualHint" : "classroom.v3.classStartAssistantHint")}</p>
    {teacher && <div className={styles.actions}>
      <button type="button" onClick={onSettings} disabled={busy}><Settings2 aria-hidden="true" />{t("classroom.v3.classStartConfigure")}</button>
      <button type="button" onClick={onStart} disabled={busy} className={styles.start}><Radio aria-hidden="true" />{t("classroom.v3.startClass")}</button>
    </div>}
  </aside>;
}
