"use client";

import { useState } from "react";
import { Clock3, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { classroomClosingClock, type ClassroomClosingNotice } from "@/lib/classroom/closing-notice";
import styles from "./closing-notice.module.css";

export function ClassroomClosingNotice({ sessionId, notice }: {
  sessionId: string;
  notice: ClassroomClosingNotice | null;
}) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState("");
  if (!notice) return null;
  const key = `${sessionId}:${notice.closesAt}:${notice.phase}`;
  const title = t(`classroom.v3.${notice.phase === "grace" ? "scheduledLessonEnded" : notice.phase === "warning" ? "roomClosingFiveMinutes" : notice.phase === "final" ? "roomClosingOneMinute" : "roomClosingTitle"}`);
  const remaining = t("classroom.v3.roomClosesIn", { minutes: Math.ceil(notice.remainingSeconds / 60) });
  const urgent = notice.phase !== "grace";
  return (
    <div className={styles.root} data-phase={notice.phase}>
      <div className={styles.metric} title={`${title} · ${notice.remainingSeconds ? remaining : t("classroom.v3.roomClosingNow")}`}>
        <Clock3 className={styles.icon} aria-hidden="true" />
        <span className={styles.compactLabel}>{t("classroom.v3.roomClosingShort")}</span>
        <div className={styles.copy}>
          <span className={styles.label}>{t("classroom.v3.scheduledLessonEnded")}</span>
          <span className={styles.detail}>{notice.remainingSeconds ? remaining : t("classroom.v3.roomClosingNow")}</span>
        </div>
        <span className={styles.countdown} role="timer" aria-label={t("classroom.v3.roomClosingCountdown")} aria-live="off">{classroomClosingClock(notice.remainingSeconds)}</span>
      </div>
      {dismissed !== key && (
        <aside className={styles.reminder} aria-label={t("classroom.v3.roomClosingReminder")}>
          <div className={styles.reminderHeading}>
            <Clock3 aria-hidden="true" />
            <strong role={urgent ? "alert" : "status"}>{title}</strong>
            <button type="button" onClick={() => setDismissed(key)} aria-label={t("classroom.v3.dismissClosingReminder")}><X /></button>
          </div>
          <p>{notice.remainingSeconds ? remaining : t("classroom.v3.roomClosingNow")}</p>
          <p className={styles.hint}>{t(notice.phase === "closing" ? "classroom.v3.roomClosingFinalHint" : "classroom.v3.roomClosingSaveHint")}</p>
        </aside>
      )}
    </div>
  );
}
