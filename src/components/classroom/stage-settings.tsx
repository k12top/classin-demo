"use client";

import { useId, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { MAX_CLASSROOM_STAGE_STUDENTS, validStageStudentLimit } from "@/lib/classroom/stage-settings";
import styles from "./stage-settings.module.css";

export function StageSettings({ studentLimit, defaultStudentLimit, studentCount, inviteBypassLimit, busy, onChange }: {
  studentLimit: number | null;
  defaultStudentLimit: number | null;
  studentCount: number;
  inviteBypassLimit: boolean;
  busy: boolean;
  onChange: (studentLimit: number | null, inviteBypassLimit: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [custom, setCustom] = useState(studentLimit !== null);
  const [draft, setDraft] = useState(String(studentLimit ?? defaultStudentLimit ?? Math.max(1, studentCount)));
  const limit = Number(draft);
  const valid = !custom || validStageStudentLimit(limit);
  const nextLimit = custom ? limit : null;
  const effectiveLimit = studentLimit ?? defaultStudentLimit;
  return <fieldset className={`classroom-v3-caption-settings ${styles.settings}`} disabled={busy}>
    <legend>{t("classroom.v3.stageSettings")}</legend>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!busy && valid && nextLimit !== studentLimit) onChange(nextLimit, inviteBypassLimit);
    }}>
      <label htmlFor={`${id}-rule`}>{t("classroom.v3.stageSettingsRule")}</label>
      <select id={`${id}-rule`} name="stageSeatRule" value={custom ? "custom" : "default"} aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const fixed = event.target.value === "custom";
          setCustom(fixed);
          if (fixed && studentLimit === null) setDraft(String(defaultStudentLimit ?? Math.max(1, studentCount)));
        }}>
        <option value="default">{defaultStudentLimit === null ? t("classroom.v3.stageSettingsFollow") : t("classroom.v3.stageSettingsDefault", { count: defaultStudentLimit })}</option>
        <option value="custom">{t("classroom.v3.stageSettingsCustom")}</option>
      </select>
      {custom && <label htmlFor={id}>{t("classroom.v3.stageStudentLimit")}</label>}
      <div className={styles.limit}>
        {custom && <input id={id} type="number" min={1} max={MAX_CLASSROOM_STAGE_STUDENTS} step={1} required
          aria-describedby={`${id}-hint`} value={draft} onChange={(event) => setDraft(event.target.value)} />}
        <button type="submit" disabled={busy || !valid || nextLimit === studentLimit}>{t("classroom.v3.stageSettingsApply")}</button>
      </div>
      <p id={`${id}-hint`}>{t(custom ? "classroom.v3.stageStudentLimitHint" : defaultStudentLimit === null ? "classroom.v3.stageSettingsFollowHint" : "classroom.v3.stageSettingsDefaultHint")}</p>
    </form>
    <label className={styles.toggle}>
      <input type="checkbox" checked={inviteBypassLimit} onChange={(event) => onChange(studentLimit, event.target.checked)} />
      <span>{t("classroom.v3.stageInviteBypassLimit")}</span>
    </label>
    <p>{t("classroom.v3.stageInviteBypassHint")}</p>
    <p role="status">{busy ? t("classroom.v3.stageSettingsSaving") : effectiveLimit === null
      ? t("classroom.v3.stageSettingsFollowing", { count: studentCount })
      : t("classroom.v3.stageSettingsCurrent", { count: effectiveLimit })}</p>
  </fieldset>;
}
