export type SessionScheduleInput =
  | {
      type: "single";
      startTime: string;
      endTime: string;
    }
  | {
      type: "recurring";
      timezone: string;
      firstDate: string;
      localStartTime: string;
      durationMinutes: number;
      weekdays: number[];
      count?: number;
      untilDate?: string;
    };

export type ConcreteSessionTime = {
  startTime: Date;
  endTime: Date;
};

export class SessionScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionScheduleError";
  }
}

function localParts(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(values.find((value) => value.type === type)?.value || 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function assertTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  } catch {
    throw new SessionScheduleError("无效的 IANA 时区");
  }
}

/** Convert local wall-clock parts to UTC while respecting DST transitions. */
export function zonedLocalToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timezone: string;
}): Date {
  assertTimezone(input.timezone);
  const desired = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
  );
  let candidate = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = localParts(candidate, input.timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const delta = desired - actualAsUtc;
    if (delta === 0) return candidate;
    candidate = new Date(candidate.getTime() + delta);
  }
  const verified = localParts(candidate, input.timezone);
  if (
    verified.year !== input.year ||
    verified.month !== input.month ||
    verified.day !== input.day ||
    verified.hour !== input.hour ||
    verified.minute !== input.minute
  ) {
    throw new SessionScheduleError("该当地时间不存在，可能处于夏令时切换区间");
  }
  return candidate;
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new SessionScheduleError("日期格式应为 YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new SessionScheduleError("日期无效");
  }
  return { year, month, day };
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new SessionScheduleError("时间格式应为 HH:mm");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new SessionScheduleError("时间无效");
  return { hour, minute };
}

export function expandSessionSchedule(
  schedule: SessionScheduleInput,
  options: { maxOccurrences?: number } = {},
): ConcreteSessionTime[] {
  const maxOccurrences = options.maxOccurrences ?? 100;
  if (schedule.type === "single") {
    const startTime = new Date(schedule.startTime);
    const endTime = new Date(schedule.endTime);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new SessionScheduleError("课次时间格式无效");
    }
    if (endTime <= startTime) {
      throw new SessionScheduleError("结束时间必须晚于开始时间");
    }
    return [{ startTime, endTime }];
  }

  assertTimezone(schedule.timezone);
  const first = parseDate(schedule.firstDate);
  const time = parseTime(schedule.localStartTime);
  const durationMinutes = Math.trunc(schedule.durationMinutes);
  if (durationMinutes < 10 || durationMinutes > 12 * 60) {
    throw new SessionScheduleError("课次时长必须在 10 到 720 分钟之间");
  }
  const weekdays = Array.from(
    new Set(schedule.weekdays.map((day) => Math.trunc(day))),
  ).filter((day) => day >= 0 && day <= 6);
  if (weekdays.length === 0) throw new SessionScheduleError("至少选择一个上课星期");

  const requestedCount = schedule.count ? Math.trunc(schedule.count) : null;
  if (requestedCount !== null && (requestedCount < 1 || requestedCount > maxOccurrences)) {
    throw new SessionScheduleError(`周期课次数必须在 1 到 ${maxOccurrences} 之间`);
  }
  const until = schedule.untilDate ? parseDate(schedule.untilDate) : null;
  if (!requestedCount && !until) {
    throw new SessionScheduleError("周期排课必须设置课次数或截止日期");
  }

  const cursor = new Date(Date.UTC(first.year, first.month - 1, first.day));
  const untilUtc = until
    ? Date.UTC(until.year, until.month - 1, until.day, 23, 59, 59)
    : null;
  const result: ConcreteSessionTime[] = [];
  for (let dayOffset = 0; dayOffset <= 366 * 3; dayOffset += 1) {
    const date = new Date(cursor.getTime() + dayOffset * 86_400_000);
    if (untilUtc !== null && date.getTime() > untilUtc) break;
    if (!weekdays.includes(date.getUTCDay())) continue;
    const startTime = zonedLocalToUtc({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: time.hour,
      minute: time.minute,
      timezone: schedule.timezone,
    });
    result.push({
      startTime,
      endTime: new Date(startTime.getTime() + durationMinutes * 60_000),
    });
    if (result.length >= maxOccurrences || result.length === requestedCount) break;
  }
  if (result.length === 0) throw new SessionScheduleError("排课规则没有生成任何课次");
  if (requestedCount && result.length < requestedCount) {
    throw new SessionScheduleError("截止日期不足以生成指定课次数");
  }
  return result;
}
