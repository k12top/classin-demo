"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { calendarMonthDays, scheduleDateKey } from "@/lib/course-schedule";
import styles from "./course-calendar.module.css";

type CourseCalendarProps = {
  month: Date;
  selectedDate: Date | null;
  dayCounts: ReadonlyMap<string, number>;
  onMonthChange: (delta: number) => void;
  onSelectDate: (date: Date) => void;
  onShowMonth: () => void;
  onToday: () => void;
};

export function CourseCalendar({
  month, selectedDate, dayCounts, onMonthChange, onSelectDate, onShowMonth, onToday,
}: CourseCalendarProps) {
  const { t, locale } = useTranslation();
  const today = scheduleDateKey(new Date());
  const selected = selectedDate ? scheduleDateKey(selectedDate) : null;
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2026, 0, 4 + index)),
  );
  const count = [...dayCounts.values()].reduce((sum, value) => sum + value, 0);
  return (
    <section className={styles.calendar} aria-label={t("teacherDashboard.schedule")}>
      <div className={styles.header}>
        <button type="button" onClick={() => onMonthChange(-1)} aria-label={t("teacherDashboard.previousMonth")}><ChevronLeft aria-hidden="true" /></button>
        <strong>{month.toLocaleDateString(locale, { year: "numeric", month: "long" })}</strong>
        <button type="button" onClick={() => onMonthChange(1)} aria-label={t("teacherDashboard.nextMonth")}><ChevronRight aria-hidden="true" /></button>
      </div>
      <div className={styles.body}>
        <div className={styles.weekdays}>{weekdays.map((day, index) => <span key={index}>{day}</span>)}</div>
        <div className={styles.days}>
          {calendarMonthDays(month).map((date, index) => {
            if (!date) return <span key={`blank-${index}`} aria-hidden="true" />;
            const key = scheduleDateKey(date);
            const lessons = dayCounts.get(key) ?? 0;
            const label = t("teacherDashboard.calendarDayCount", {
              date: date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" }),
              count: lessons,
            });
            return (
              <button
                type="button"
                key={key}
                className={styles.day}
                data-selected={key === selected}
                aria-pressed={key === selected}
                aria-current={key === today ? "date" : undefined}
                aria-label={label}
                title={label}
                onClick={() => onSelectDate(date)}
              >
                <span>{date.getDate()}</span>
                <small>{lessons > 0 ? t("teacherDashboard.dayLessons", { count: lessons }) : "\u00a0"}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.footer}>
        <p>{t("teacherDashboard.monthSummary", { count, days: dayCounts.size })}</p>
        <div><button type="button" onClick={onToday}>{t("teacherDashboard.backToToday")}</button><button type="button" aria-pressed={!selectedDate} onClick={onShowMonth}>{t("teacherDashboard.showMonth")}</button></div>
      </div>
    </section>
  );
}
