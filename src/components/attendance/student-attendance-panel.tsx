"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarCheck2,
  Clock3,
  Flame,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import type { StudentAttendanceStatus } from "@/lib/student-attendance";
import styles from "./student-attendance-panel.module.css";

type AttendanceLesson = {
  sessionId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: StudentAttendanceStatus;
  joinCount: number;
  firstEnteredAt: string | null;
  lastActivityAt: string | null;
  totalDurationSec: number;
  completionRate: number;
  late: boolean;
  online: boolean;
  completed: boolean;
};

type AttendanceSummary = {
  eligibleLessonCount: number;
  completedLessonCount: number;
  attendedLessonCount: number;
  absentLessonCount: number;
  lateLessonCount: number;
  attendanceRate: number;
  punctualRate: number;
  currentStreak: number;
  totalDurationSec: number;
};

type AttendancePayload = {
  summary: AttendanceSummary;
  lessons: AttendanceLesson[];
  error?: string;
};

type CalendarDay = { date: Date; key: string };

const EMPTY_SUMMARY: AttendanceSummary = {
  eligibleLessonCount: 0,
  completedLessonCount: 0,
  attendedLessonCount: 0,
  absentLessonCount: 0,
  lateLessonCount: 0,
  attendanceRate: 0,
  punctualRate: 0,
  currentStreak: 0,
  totalDurationSec: 0,
};

function dateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfAttendanceWall(today = new Date()) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset - 51 * 7);
  return start;
}

function buildCalendarDays(today = new Date()) {
  const start = startOfAttendanceWall(today);
  return Array.from({ length: 52 * 7 }, (_, index): CalendarDay => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, key: dateKey(date) };
  });
}

function dayTone(lessons: AttendanceLesson[]) {
  if (!lessons.length) return "empty";
  const active = lessons.filter((lesson) => lesson.status !== "cancelled");
  if (!active.length) return "cancelled";
  const completed = active.filter((lesson) => lesson.completed);
  const attended = completed.filter((lesson) => lesson.status !== "absent");
  if (completed.length && !attended.length) return "absent";
  if (completed.length && attended.length < completed.length) return "partial";
  if (active.some((lesson) => lesson.status === "partial")) return "partial";
  if (active.some((lesson) => lesson.status === "late")) return "late";
  if (active.some((lesson) => lesson.status === "present")) return "present";
  if (active.some((lesson) => lesson.status === "live")) return "live";
  return "upcoming";
}

export function StudentAttendancePanel({
  courseId,
  enabled,
}: {
  courseId: string;
  enabled: boolean;
}) {
  const { t, locale } = useTranslation();
  const [payload, setPayload] = useState<AttendancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError("");
    });
    void fetch(`/api/courses/${encodeURIComponent(courseId)}/attendance/me`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const next = (await response.json()) as AttendancePayload;
        if (!response.ok) throw new Error(next.error || t("studentAttendance.loadFailed"));
        setPayload(next);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : t("studentAttendance.loadFailed"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [courseId, enabled, revision, t]);

  const calendarDays = useMemo(() => buildCalendarDays(), []);
  const weeks = useMemo(
    () => Array.from({ length: 52 }, (_, index) => calendarDays.slice(index * 7, index * 7 + 7)),
    [calendarDays],
  );
  const lessonsByDay = useMemo(() => {
    const map = new Map<string, AttendanceLesson[]>();
    for (const lesson of payload?.lessons || []) {
      const key = dateKey(new Date(lesson.startTime));
      map.set(key, [...(map.get(key) || []), lesson]);
    }
    return map;
  }, [payload]);
  const mostRecentLessonDay = useMemo(() => {
    const lessons = payload?.lessons || [];
    return lessons.length ? dateKey(new Date(lessons[lessons.length - 1].startTime)) : dateKey(new Date());
  }, [payload]);
  const activeDate = selectedDate || mostRecentLessonDay;
  const activeLessons = lessonsByDay.get(activeDate) || [];
  const summary = payload?.summary || EMPTY_SUMMARY;

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", weekday: "short" }),
    [locale],
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short" }),
    [locale],
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }),
    [locale],
  );

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours
      ? t("studentAttendance.durationHours", { hours, minutes })
      : t("studentAttendance.durationMinutes", { minutes });
  };

  if (loading && !payload) {
    return (
      <div className={styles.loading} role="status">
        <Loader2 aria-hidden="true" />
        <span>{t("studentAttendance.loading")}</span>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className={styles.error} role="alert">
        <p>{error}</p>
        <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
          <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
          {t("studentAttendance.retry")}
        </Button>
      </div>
    );
  }

  return (
    <section className={styles.shell} aria-labelledby="student-attendance-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{t("studentAttendance.eyebrow")}</span>
          <h2 id="student-attendance-title">{t("studentAttendance.title")}</h2>
          <p>{t("studentAttendance.description")}</p>
        </div>
        <div className={styles.recordCount}>
          <span>{t("studentAttendance.completed")}</span>
          <strong>{summary.attendedLessonCount}/{summary.completedLessonCount}</strong>
        </div>
      </header>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <Activity aria-hidden="true" />
          <span>{t("studentAttendance.attendanceRate")}</span>
          <strong>{Math.round(summary.attendanceRate * 100)}%</strong>
        </div>
        <div className={styles.metric}>
          <CalendarCheck2 aria-hidden="true" />
          <span>{t("studentAttendance.punctualRate")}</span>
          <strong>{Math.round(summary.punctualRate * 100)}%</strong>
        </div>
        <div className={styles.metric}>
          <Flame aria-hidden="true" />
          <span>{t("studentAttendance.currentStreak")}</span>
          <strong>{t("studentAttendance.lessonCount", { count: summary.currentStreak })}</strong>
        </div>
        <div className={styles.metric}>
          <Clock3 aria-hidden="true" />
          <span>{t("studentAttendance.onlineDuration")}</span>
          <strong>{formatDuration(summary.totalDurationSec)}</strong>
        </div>
      </div>

      <div className={styles.wallSection}>
        <div className={styles.wallHeading}>
          <div>
            <h3>{t("studentAttendance.wallTitle")}</h3>
            <p>{t("studentAttendance.wallDescription")}</p>
          </div>
          <div className={styles.legend} aria-label={t("studentAttendance.legend")}> 
            {(["present", "late", "absent", "upcoming"] as const).map((tone) => (
              <span key={tone}><i data-tone={tone} />{t(`studentAttendance.legend${tone[0].toUpperCase()}${tone.slice(1)}`)}</span>
            ))}
          </div>
        </div>

        <div className={styles.wallScroller}>
          <div className={styles.wall}>
            <div className={styles.months} aria-hidden="true">
              {weeks.map((week, index) => {
                const previous = weeks[index - 1]?.[0].date;
                const current = week[0].date;
                const show = index === 0 || previous?.getMonth() !== current.getMonth();
                return <span key={week[0].key}>{show ? monthFormatter.format(current) : ""}</span>;
              })}
            </div>
            <div className={styles.wallBody}>
              <div className={styles.weekdays} aria-hidden="true">
                {weeks[0].map((day) => (
                  <span key={day.key}>{new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(day.date)}</span>
                ))}
              </div>
              <div className={styles.weeks}>
                {weeks.map((week) => (
                  <div className={styles.week} key={week[0].key}>
                    {week.map((day) => {
                      const dayLessons = lessonsByDay.get(day.key) || [];
                      const tone = dayTone(dayLessons);
                      const label = dayLessons.length
                        ? t("studentAttendance.dayWithLessons", {
                            date: dayFormatter.format(day.date),
                            count: dayLessons.length,
                          })
                        : t("studentAttendance.dayWithoutLessons", { date: dayFormatter.format(day.date) });
                      if (!dayLessons.length) {
                        return (
                          <span
                            key={day.key}
                            className={styles.day}
                            data-tone="empty"
                            aria-hidden="true"
                          />
                        );
                      }
                      return (
                        <button
                          key={day.key}
                          type="button"
                          className={styles.day}
                          data-tone={tone}
                          data-selected={activeDate === day.key ? "true" : "false"}
                          aria-label={label}
                          title={label}
                          onClick={() => setSelectedDate(day.key)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.dayDetail}>
        <header>
          <span>{t("studentAttendance.selectedDay")}</span>
          <strong>{dayFormatter.format(new Date(`${activeDate}T12:00:00`))}</strong>
        </header>
        {activeLessons.length ? (
          <div className={styles.lessonList}>
            {activeLessons.map((lesson) => (
              <article className={styles.lesson} key={lesson.sessionId}>
                <i data-tone={lesson.status} />
                <div className={styles.lessonMain}>
                  <strong>{lesson.title}</strong>
                  <span>
                    {timeFormatter.format(new Date(lesson.startTime))}–{timeFormatter.format(new Date(lesson.endTime))}
                  </span>
                </div>
                <div className={styles.lessonMeta}>
                  <span data-tone={lesson.status}>{t(`studentAttendance.status.${lesson.status}`)}</span>
                  {lesson.joinCount > 0 && (
                    <small>
                      {t("studentAttendance.lessonDetail", {
                        joins: lesson.joinCount,
                        duration: formatDuration(lesson.totalDurationSec),
                      })}
                    </small>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.noLessons}>{t("studentAttendance.noLessons")}</p>
        )}
      </div>
    </section>
  );
}
