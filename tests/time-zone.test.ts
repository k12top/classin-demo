import assert from "node:assert/strict";
import test from "node:test";
import { parseZonedInput, zonedInputValue, zonedDateKey, isExplicitInstant, rescheduleZonedOccurrence } from "../src/lib/time-zone";
import { searchTimeZones, timeZoneCity, timeZoneOffset, compactOffsetName } from "../src/lib/time-zone-catalog";
import { expandSessionSchedule } from "../src/lib/course-session-schedule";
import { monthSchedule, buildCourseSchedule } from "../src/lib/course-schedule";

test("scheduling cities reinterpret an unchanged clock; display conversion preserves the instant", () => {
  const local = "2026-11-02T19:30";
  const shanghai = parseZonedInput(local, "Asia/Shanghai");
  const newYork = parseZonedInput(local, "America/New_York");
  assert.notEqual(shanghai.toISOString(), newYork.toISOString());
  assert.equal(zonedInputValue(newYork, "America/New_York"), local);
  assert.equal(zonedInputValue(newYork, "Asia/Shanghai"), "2026-11-03T08:30");
  assert.equal(parseZonedInput("2026-11-03T08:30", "Asia/Shanghai").toISOString(), newYork.toISOString());
});
test("invalid dates, nonexistent and ambiguous DST times fail explicitly", () => {
  for (const [value, zone] of [["2026-02-30T09:00", "Asia/Shanghai"], ["2026-03-08T02:30", "America/New_York"], ["2026-11-01T01:30", "America/New_York"], ["2026-10-23T09:00", "Invalid/Zone"]]) assert.throws(() => parseZonedInput(value, zone));
  assert.throws(() => parseZonedInput("2026-04-05T01:45", "Australia/Lord_Howe"));
});
test("network timestamps require explicit UTC or offset", () => {
  assert.equal(isExplicitInstant("2026-10-23T13:00"), false);
  assert.equal(isExplicitInstant("2026-10-23T13:00:00+07:00"), true);
  assert.throws(() => expandSessionSchedule({ type: "single", startTime: "2026-10-23T13:00", endTime: "2026-10-23T14:00" }));
});
test("future series edits preserve local hours across DST and across selected cities", () => {
  const original = parseZonedInput("2026-03-01T09:00", "America/New_York");
  const next = parseZonedInput("2026-03-01T10:00", "America/New_York");
  const target = parseZonedInput("2026-03-08T09:00", "America/New_York");
  assert.equal(rescheduleZonedOccurrence(target, original, next, "America/New_York", "America/New_York").toISOString(), "2026-03-08T14:00:00.000Z");
  const london = parseZonedInput("2026-03-01T10:00", "Europe/London");
  assert.equal(zonedInputValue(rescheduleZonedOccurrence(target, original, london, "America/New_York", "Europe/London"), "Europe/London"), "2026-03-08T10:00");
});
test("calendar month and day boundaries use the display zone", () => {
  assert.equal(zonedDateKey("2026-10-31T16:30:00Z", "Asia/Shanghai"), "2026-11-01");
  const entries = buildCourseSchedule([{ id: "course", status: "scheduled", roomType: 4, teacherName: "Teacher", startTime: "2026-10-31T16:30:00Z", endTime: "2026-10-31T17:30:00Z" }]);
  assert.equal(monthSchedule(entries, new Date(2026, 9, 1), "Asia/Jakarta").get("2026-10-31")?.length, 1);
  assert.equal(monthSchedule(entries, new Date(2026, 9, 1), "Asia/Shanghai").size, 0);
  assert.equal(monthSchedule(entries, new Date(2026, 10, 1), "Asia/Shanghai").get("2026-11-01")?.length, 1);
});
test("country, city aliases and IANA searches cover multi-zone countries", () => {
  const indonesia = searchTimeZones("印尼", "zh-CN").map(row => row.zone);
  for (const zone of ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]) assert.ok(indonesia.includes(zone));
  const usa = searchTimeZones("美国", "zh-CN");
  assert.ok(usa.length > 3);
  assert.ok(searchTimeZones("Australia", "en").length > 5);
  assert.ok(searchTimeZones("Asia/Kolkata", "zh-CN").length);
  assert.equal(searchTimeZones("Bali", "en")[0].zone, "Asia/Makassar");
  assert.equal(timeZoneCity("America/New_York", "zh-TW"), "紐約");
  assert.equal(timeZoneOffset("America/New_York", new Date("2026-07-01")), "UTC-4");
  assert.equal(timeZoneOffset("America/New_York", new Date("2026-12-01")), "UTC-5");
});

// Real regression: Node ICU emitted GMT while Chromium emitted GMT+00:00.
test("zero-offset ICU variants produce identical SSR and browser labels", () => {
  assert.equal(compactOffsetName("GMT"), "UTC");
  assert.equal(compactOffsetName("GMT+00:00"), "UTC");
  assert.equal(compactOffsetName("GMT-00:00"), "UTC");
  assert.equal(compactOffsetName("GMT+05:45"), "UTC+5:45");
  assert.equal(timeZoneOffset("UTC", new Date(0)), "UTC");
});
