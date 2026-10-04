"use client";

import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTeacherSchedules } from "@/hooks/use-teacher-schedules";
import { useTranslation } from "@/lib/i18n/context";
import { addLocalDays, startOfLocalDay } from "@/lib/teacher-schedule";
import styles from "./teacher-plan-settings.module.css";

function localDateKey(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function sameLocalDay(value: string, key: string) {
  return localDateKey(new Date(value)) === key;
}

export function TeacherPlanSettings({ teacherId }: { teacherId: string }) {
  const { t, locale } = useTranslation();
  const days = useMemo(() => {
    const first = startOfLocalDay();
    return Array.from({ length: 7 }, (_, index) => addLocalDays(first, index));
  }, []);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(days[0]));
  const [kind, setKind] = useState<"busy" | "available">("busy");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const { schedules, loading, refresh } = useTeacherSchedules([teacherId], { days: 7 });
  const events = schedules[teacherId]?.events || [];
  const selectedEvents = events.filter((event) => sameLocalDay(event.startTime, selectedDate));

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }),
    [locale],
  );

  const saveBlock = async () => {
    const startTime = new Date(`${selectedDate}T${start}:00`);
    const endTime = new Date(`${selectedDate}T${end}:00`);
    if (endTime <= startTime) {
      setMessage(t("teacherSchedule.invalidRange"));
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/teachers/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          kind,
          title,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t("teacherSchedule.saveFailed"));
      setTitle("");
      setMessage(t("teacherSchedule.saved"));
      refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : t("teacherSchedule.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const deleteBlock = async (id: string) => {
    const response = await fetch(`/api/teachers/schedule/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.ok) refresh();
  };

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div>
          <span><CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />{t("teacherSchedule.eyebrow")}</span>
          <h2>{t("teacherSchedule.myPlan")}</h2>
          <p>{t("teacherSchedule.myPlanDescription")}</p>
        </div>
        <div className={styles.legend} aria-label={t("teacherSchedule.legend")}>
          <span>{t("teacherSchedule.kind.busy")}</span>
          <span>{t("teacherSchedule.kind.available")}</span>
        </div>
      </header>
      <div className={styles.body}>
        <div className={styles.editor}>
          <div className={styles.dayRail}>
            {days.map((day) => {
              const key = localDateKey(day);
              return (
                <button type="button" key={key} data-active={selectedDate === key} onClick={() => setSelectedDate(key)}>
                  <span>{dayFormatter.format(day)}</span>
                  <strong>{day.getDate()}</strong>
                </button>
              );
            })}
          </div>
          <div className={styles.form}>
            <label>
              {t("teacherSchedule.planType")}
              <select value={kind} onChange={(event) => setKind(event.target.value as "busy" | "available")}>
                <option value="busy">{t("teacherSchedule.kind.busy")}</option>
                <option value="available">{t("teacherSchedule.kind.available")}</option>
              </select>
            </label>
            <label>{t("teacherSchedule.start")}<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            <label>{t("teacherSchedule.end")}<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
            <label className={styles.note}>{t("teacherSchedule.note")}<input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder={t("teacherSchedule.notePlaceholder")} /></label>
          </div>
          <div className={styles.actions}>
            <p>{message || t("teacherSchedule.planPrivacyHint")}</p>
            <button type="button" onClick={() => void saveBlock()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {t("teacherSchedule.addPlan")}
            </button>
          </div>
        </div>
        <aside className={styles.agenda}>
          <h3>{t("teacherSchedule.dayAgenda")}</h3>
          {loading ? (
            <p className={styles.empty}>{t("teacherSchedule.loading")}</p>
          ) : selectedEvents.length ? (
            <div className={styles.agendaList}>
              {selectedEvents.map((event) => (
                <div className={styles.agendaItem} data-kind={event.kind} key={event.id}>
                  <time>{timeFormatter.format(new Date(event.startTime))}</time>
                  <strong>{event.title || t(`teacherSchedule.kind.${event.kind}`)}</strong>
                  {event.kind !== "course" ? (
                    <button type="button" onClick={() => void deleteBlock(event.id)} aria-label={t("common.delete")}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>{t("teacherSchedule.dayEmpty")}</p>
          )}
        </aside>
      </div>
    </section>
  );
}
