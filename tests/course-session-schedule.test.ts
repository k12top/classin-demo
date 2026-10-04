import assert from "node:assert/strict";
import test from "node:test";
import {
  expandSessionSchedule,
  SessionScheduleError,
  zonedLocalToUtc,
} from "../src/lib/course-session-schedule";

test("single lesson keeps the exact start and end instants", () => {
  const result = expandSessionSchedule({
    type: "single",
    startTime: "2026-07-29T02:00:00.000Z",
    endTime: "2026-07-29T03:30:00.000Z",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].startTime.toISOString(), "2026-07-29T02:00:00.000Z");
  assert.equal(result[0].endTime.toISOString(), "2026-07-29T03:30:00.000Z");
});

test("recurring lessons preserve local wall time across daylight saving", () => {
  const result = expandSessionSchedule({
    type: "recurring",
    timezone: "America/New_York",
    firstDate: "2026-03-01",
    localStartTime: "09:00",
    durationMinutes: 60,
    weekdays: [0],
    count: 3,
  });
  assert.deepEqual(
    result.map((item) => item.startTime.toISOString()),
    [
      "2026-03-01T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-15T13:00:00.000Z",
    ],
  );
});

test("recurring lesson count, weekday and duration are enforced", () => {
  const result = expandSessionSchedule({
    type: "recurring",
    timezone: "Asia/Bangkok",
    firstDate: "2026-07-29",
    localStartTime: "19:30",
    durationMinutes: 90,
    weekdays: [1, 3, 5],
    count: 5,
  });
  assert.equal(result.length, 5);
  for (const item of result) {
    assert.equal(item.endTime.getTime() - item.startTime.getTime(), 90 * 60_000);
  }
});

test("nonexistent local time at DST transition is rejected", () => {
  assert.throws(
    () =>
      zonedLocalToUtc({
        year: 2026,
        month: 3,
        day: 8,
        hour: 2,
        minute: 30,
        timezone: "America/New_York",
      }),
    SessionScheduleError,
  );
});

test("invalid recurrence rules fail before database writes", () => {
  assert.throws(
    () =>
      expandSessionSchedule({
        type: "recurring",
        timezone: "Not/A_Timezone",
        firstDate: "2026-07-29",
        localStartTime: "10:00",
        durationMinutes: 60,
        weekdays: [3],
        count: 2,
      }),
    SessionScheduleError,
  );
  assert.throws(
    () =>
      expandSessionSchedule({
        type: "recurring",
        timezone: "Asia/Shanghai",
        firstDate: "2026-07-29",
        localStartTime: "10:00",
        durationMinutes: 60,
        weekdays: [],
        count: 2,
      }),
    SessionScheduleError,
  );
});
