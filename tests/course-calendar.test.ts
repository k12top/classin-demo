import assert from "node:assert/strict";
import test from "node:test";
import { serializeCourse } from "../src/lib/course-serialize";
import {
  buildCourseSchedule,
  calendarMonthDays,
  monthSchedule,
  scheduleDateKey,
  scheduledPlaybackPath,
  formatCourseDuration,
} from "../src/lib/course-schedule";

const session = (id: string, day: string, extra = {}) => ({
  id, title: `Lesson ${id}`, position: 1, roomUuid: id, roomType: 4,
  status: "scheduled", startTime: `${day}T09:00:00`, endTime: `${day}T10:00:00`,
  ...extra,
});
const course = (sessions: ReturnType<typeof session>[]) => ({
  id: "series", name: "CSP-J", status: "scheduled", roomType: 4,
  teacherName: "Teacher", startTime: "2026-10-11T09:00:00", endTime: "2026-10-11T10:00:00",
  sessions,
});

test("serialized series expands every lesson, not just its representative next lesson", () => {
  const input = serializeCourse(course([
    session("oct25", "2026-10-25"), session("oct11", "2026-10-11"),
    session("oct18", "2026-10-18"), session("oct31", "2026-10-31"),
    session("nov1", "2026-11-01"),
  ]));
  const entries = buildCourseSchedule([input]);
  assert.equal(entries.length, 5);
  const october = monthSchedule(entries, new Date(2026, 9, 1));
  assert.deepEqual([...october.keys()], ["2026-10-11", "2026-10-18", "2026-10-25", "2026-10-31"]);
  assert.equal(monthSchedule(entries, new Date(2026, 10, 1)).get("2026-11-01")?.[0].sessionId, "nov1");
  assert.equal(new Set(entries.map((entry) => entry.scheduleId)).size, 5);
  assert.equal(entries[0].id, "series");
});

test("multiple lessons of the same course keep separate times, teachers, states and playback", () => {
  const input = course([
    session("morning", "2026-10-18", { status: "live", endedAt: "2026-10-18T10:00:00", _count: { recordings: 1 } }),
    session("afternoon", "2026-10-18", { startTime: "2026-10-18T14:00:00", leadTeacherName: "Substitute", roomType: 0 }),
    session("cancelled", "2026-10-19", { status: "cancelled", endedAt: "2026-10-19T10:00:00" }),
  ]);
  const entries = buildCourseSchedule([{ ...input, hasPlayback: true }]);
  assert.equal(monthSchedule(entries, new Date(2026, 9, 1)).get("2026-10-18")?.length, 2);
  assert.deepEqual(entries.map((entry) => entry.status), ["finished", "scheduled", "cancelled"]);
  assert.deepEqual(entries.map((entry) => entry.hasPlayback), [true, false, false]);
  assert.equal(entries[1].teacherName, "Substitute");
  assert.equal(entries[1].roomType, 0);
});

test("unscheduled lessons do not borrow the parent time or create phantom dates", () => {
  const bad = session("bad", "2026-10-11", { startTime: "invalid" });
  assert.deepEqual(buildCourseSchedule([course([bad])]), []);
  const legacy = { ...course([]), sessions: undefined };
  assert.equal(buildCourseSchedule([legacy, legacy]).length, 1);
  assert.equal(buildCourseSchedule([{ ...legacy, startTime: null }]).length, 0);
  const duplicated = course([session("same", "2026-10-18"), session("same", "2026-10-18")]);
  assert.equal(buildCourseSchedule([duplicated]).length, 1);
});

test("month boundaries follow the viewer's local dates across a year boundary", () => {
  const at = (date: Date) => ({ startTime: date.toISOString() });
  const days = monthSchedule([
    at(new Date(2026, 11, 31, 23, 59)), at(new Date(2027, 0, 1)),
    at(new Date(2027, 0, 31, 23, 59)), at(new Date(2027, 1, 1)),
  ], new Date(2027, 0, 15));
  assert.deepEqual([...days.keys()], ["2027-01-01", "2027-01-31"]);
  assert.equal(scheduleDateKey(new Date(2027, 0, 1)), "2027-01-01");
});

test("calendar retains leap day and all six rows in a long month", () => {
  const leap = calendarMonthDays(new Date(2028, 1, 1));
  assert.equal(leap.filter(Boolean).length, 29);
  assert.equal(leap.length % 7, 0);
  const sixRows = calendarMonthDays(new Date(2026, 7, 1));
  assert.equal(sixRows.length, 42);
  assert.equal(sixRows[6]?.getDate(), 1);
  assert.equal(sixRows[36]?.getDate(), 31);
});

test("replay targets the selected lesson while preserving legacy course links", () => {
  assert.equal(scheduledPlaybackPath("course", "second"), "/courses/course/playback?sessionId=second");
  assert.equal(scheduledPlaybackPath("course"), "/courses/course/playback");
  assert.equal(scheduledPlaybackPath("a/b", "lesson &1"), "/courses/a%2Fb/playback?sessionId=lesson%20%261");
  assert.match(formatCourseDuration(90, "en"), /1.*30/);
});
