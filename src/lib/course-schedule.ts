const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 12 * 60;

export const DEFAULT_COURSE_DURATION_MINUTES = 60;
export const COURSE_DURATION_PRESETS = [30, 45, 60, 90, 120, 180, 240] as const;

export function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function normalizeCourseDuration(
  value: number,
  fallback = DEFAULT_COURSE_DURATION_MINUTES,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(value)));
}

export function durationBetweenLocalValues(
  startValue: string,
  endValue: string,
  fallback = DEFAULT_COURSE_DURATION_MINUTES,
): number {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return fallback;
  }
  return normalizeCourseDuration((end.getTime() - start.getTime()) / 60_000, fallback);
}

export function addMinutesToLocalValue(startValue: string, minutes: number): string {
  if (!startValue) return "";
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(
    start.getTime() + normalizeCourseDuration(minutes) * 60_000,
  );
  return toDateTimeLocalValue(end.toISOString());
}

export function formatCourseDuration(minutes: number, locale: string): string {
  const normalized = normalizeCourseDuration(minutes);
  const hours = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  const parts = [];
  if (hours) {
    parts.push(
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit: "hour",
        unitDisplay: "short",
      }).format(hours),
    );
  }
  if (remainder || !hours) {
    parts.push(
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit: "minute",
        unitDisplay: "short",
      }).format(remainder),
    );
  }
  return parts.join(" ");
}

export type ScheduleSession = {
  id: string;
  title?: string;
  position?: number;
  status: string;
  startTime: string | null;
  endTime: string | null;
  endedAt?: string | null;
  roomType?: number;
  leadTeacherName?: string | null;
  leadTeacherAvatar?: string | null;
  _count?: { recordings?: number };
};

type ScheduleSource = {
  id: string;
  status: string;
  startTime: string | null;
  endTime: string | null;
  roomType: number;
  teacherName: string;
  teacherAvatar?: string;
  hasPlayback?: boolean;
  sessions?: ScheduleSession[];
};

export type ScheduleEntry = {
  scheduleId: string;
  sessionId?: string;
  sessionTitle?: string;
  sessionPosition?: number;
  startTime: string;
};

/** Course-level times describe one representative lesson, never the full schedule. */
export function buildCourseSchedule<T extends ScheduleSource>(courses: readonly T[]): (T & ScheduleEntry)[] {
  const entries: (T & ScheduleEntry)[] = [];
  const seen = new Set<string>();
  for (const course of courses) {
    if (course.sessions?.length) {
      for (const session of course.sessions) {
        const scheduleId = `${course.id}:${session.id}`;
        if (!session.startTime || !Number.isFinite(Date.parse(session.startTime)) || seen.has(scheduleId)) continue;
        seen.add(scheduleId);
        entries.push({
          ...course, scheduleId, sessionId: session.id, sessionTitle: session.title,
          sessionPosition: session.position, startTime: session.startTime,
          endTime: session.endTime && Number.isFinite(Date.parse(session.endTime)) ? session.endTime : null,
          roomType: session.roomType ?? course.roomType,
          teacherName: session.leadTeacherName || course.teacherName,
          teacherAvatar: session.leadTeacherAvatar || course.teacherAvatar,
          status: session.endedAt && session.status !== "cancelled" ? "finished" : session.status,
          hasPlayback: (session._count?.recordings ?? 0) > 0 || (course.sessions.length === 1 && Boolean(course.hasPlayback)),
        });
      }
    } else if (course.startTime && Number.isFinite(Date.parse(course.startTime)) && !seen.has(course.id)) {
      seen.add(course.id);
      entries.push({ ...course, scheduleId: course.id, startTime: course.startTime });
    }
  }
  return entries.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.scheduleId.localeCompare(b.scheduleId));
}

export function scheduleDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthSchedule<T extends { startTime: string }>(entries: readonly T[], month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1).getTime();
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime();
  const days = new Map<string, T[]>();
  for (const entry of entries) {
    const time = Date.parse(entry.startTime);
    if (time < start || time >= end || !Number.isFinite(time)) continue;
    const key = scheduleDateKey(new Date(time));
    const day = days.get(key) ?? [];
    day.push(entry);
    days.set(key, day);
  }
  return days;
}

export function calendarMonthDays(month: Date): (Date | null)[] {
  const year = month.getFullYear(), index = month.getMonth();
  const days: (Date | null)[] = Array(new Date(year, index, 1).getDay()).fill(null);
  for (let day = 1; day <= new Date(year, index + 1, 0).getDate(); day++) days.push(new Date(year, index, day));
  while (days.length % 7) days.push(null);
  return days;
}

export function scheduledPlaybackPath(courseId: string, sessionId?: string): string {
  const path = `/courses/${encodeURIComponent(courseId)}/playback`;
  return sessionId ? `${path}?sessionId=${encodeURIComponent(sessionId)}` : path;
}
