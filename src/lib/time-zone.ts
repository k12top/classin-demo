import { zonedLocalToUtc } from "./course-session-schedule";

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}

export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
}

export function zonedDateKey(value: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function zonedInputValue(value: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  return `${zonedDateKey(value, timeZone)}T${parts.find(p => p.type === "hour")!.value}:${parts.find(p => p.type === "minute")!.value}`;
}

export function parseZonedInput(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !validTimeZone(timezone)) throw new Error("Invalid local date or time zone");
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) throw new Error("Invalid local date");
  const date = zonedLocalToUtc({ year, month, day, hour, minute, timezone });
  if (zonedInputValue(date, timezone) !== value) throw new Error("Invalid local date");
  return date;
}

export function timeZoneLabel(timeZone: string, value = new Date()) {
  const offset = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "longOffset" }).formatToParts(value).find(p => p.type === "timeZoneName")?.value.replace("GMT", "UTC") || "UTC";
  return `${timeZone} (${offset})`;
}

export function isExplicitInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

/** Shift a series by calendar days and wall time, preserving its local hour across DST. */
export function rescheduleZonedOccurrence(target: Date, original: Date, next: Date, originalZone: string, nextZone: string) {
  const dayNumber = (date: Date, zone: string) => Date.parse(`${zonedDateKey(date, zone)}T00:00:00Z`);
  const shift = dayNumber(next, nextZone) - dayNumber(original, originalZone);
  const targetDay = new Date(dayNumber(target, originalZone) + shift).toISOString().slice(0, 10);
  return parseZonedInput(`${targetDay}T${zonedInputValue(next, nextZone).slice(11)}`, nextZone);
}

export function zonedCalendarDate(value: Date, timeZone: string) {
  const [year, month, day] = zonedDateKey(value, timeZone).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
