"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n/context";
import {
  addLocalDays,
  startOfLocalDay,
  teacherScheduleConflict,
  type TeacherScheduleEvent,
} from "@/lib/teacher-schedule";
import styles from "./teacher-schedule-peek.module.css";

export { styles as teacherSchedulePeekStyles };

function sameLocalDay(value: string, date: Date) {
  const eventDate = new Date(value);
  return eventDate.getFullYear() === date.getFullYear() &&
    eventDate.getMonth() === date.getMonth() &&
    eventDate.getDate() === date.getDate();
}

export function TeacherSchedulePeek({
  events,
  loading,
  candidateStart,
  candidateEnd,
}: {
  events: TeacherScheduleEvent[];
  loading?: boolean;
  candidateStart?: Date | string | null;
  candidateEnd?: Date | string | null;
}) {
  const { t, locale } = useTranslation();
  const days = useMemo(() => {
    const first = startOfLocalDay();
    return Array.from({ length: 7 }, (_, index) => addLocalDays(first, index));
  }, []);
  const conflict = teacherScheduleConflict(events, candidateStart, candidateEnd);
  const todayCount = events.filter((event) => sameLocalDay(event.startTime, days[0])).length;
  const scheduledCount = events.filter((event) => event.kind !== "available").length;
  const tone = conflict.hasConflict
    ? "danger"
    : conflict.outsidePreference
      ? "warning"
      : "clear";
  const SummaryIcon = loading
    ? Loader2
    : conflict.hasConflict || conflict.outsidePreference
      ? AlertTriangle
      : scheduledCount || todayCount
        ? CalendarClock
        : CheckCircle2;
  const summary = loading
    ? t("teacherSchedule.loading")
    : conflict.hasConflict
      ? t("teacherSchedule.conflictCount", { count: conflict.conflicts.length })
      : conflict.outsidePreference
        ? t("teacherSchedule.outsidePreference")
        : t("teacherSchedule.sevenDayCount", { count: scheduledCount });

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }),
    [locale],
  );
  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }),
    [locale],
  );

  return (
    <div className={styles.root}>
      <span className={styles.summary} data-tone={tone}>
        <SummaryIcon className={loading ? "animate-spin" : ""} aria-hidden="true" />
        {summary}
      </span>
      <div className={styles.peek}>
        <div className={styles.peekInner}>
          <div className={styles.content}>
            {conflict.hasConflict || conflict.outsidePreference ? (
              <p className={styles.conflict} data-tone={conflict.hasConflict ? "danger" : "warning"}>
                <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                {conflict.hasConflict
                  ? t("teacherSchedule.conflictHint")
                  : t("teacherSchedule.preferenceHint")}
              </p>
            ) : null}
            <div className={styles.days} aria-label={t("teacherSchedule.nextSevenDays")}>
              {days.map((day) => {
                const dayEvents = events.filter((event) => sameLocalDay(event.startTime, day));
                return (
                  <div className={styles.day} key={day.toISOString()}>
                    <time dateTime={day.toISOString()}>{dayFormatter.format(day)}</time>
                    <div className={styles.dayEvents}>
                      {dayEvents.length ? dayEvents.slice(0, 3).map((event) => (
                        <span
                          className={styles.event}
                          data-kind={event.kind}
                          key={event.id}
                          title={`${event.title || t(`teacherSchedule.kind.${event.kind}`)} · ${timeFormatter.format(new Date(event.startTime))}–${timeFormatter.format(new Date(event.endTime))}`}
                        >
                          {timeFormatter.format(new Date(event.startTime))} {event.title || t(`teacherSchedule.kind.${event.kind}`)}
                        </span>
                      )) : (
                        <span className={styles.empty}><Clock3 aria-hidden="true" className="inline h-2.5 w-2.5" /> {t("teacherSchedule.free")}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
