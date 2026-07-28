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
