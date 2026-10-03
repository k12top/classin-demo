import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduleRangesOverlap,
  teacherScheduleConflict,
  type TeacherScheduleEvent,
} from "../src/lib/teacher-schedule";

const events: TeacherScheduleEvent[] = [
  {
    id: "course-1",
    kind: "course",
    title: "Existing class",
    startTime: "2026-07-29T02:00:00.000Z",
    endTime: "2026-07-29T03:00:00.000Z",
  },
  {
    id: "available-1",
    kind: "available",
    title: "Preferred hours",
    startTime: "2026-07-29T01:00:00.000Z",
    endTime: "2026-07-29T05:00:00.000Z",
  },
];

test("adjacent teaching ranges do not conflict", () => {
  assert.equal(
    scheduleRangesOverlap(
      "2026-07-29T01:00:00.000Z",
      "2026-07-29T02:00:00.000Z",
      "2026-07-29T02:00:00.000Z",
      "2026-07-29T03:00:00.000Z",
    ),
    false,
  );
});

test("an existing class is reported as a hard scheduling conflict", () => {
  const result = teacherScheduleConflict(
    events,
    "2026-07-29T02:30:00.000Z",
    "2026-07-29T03:30:00.000Z",
  );
  assert.equal(result.hasConflict, true);
  assert.deepEqual(result.conflicts.map((event) => event.id), ["course-1"]);
});

test("available blocks guide scheduling without becoming hard conflicts", () => {
  const preferred = teacherScheduleConflict(
    events,
    "2026-07-29T03:30:00.000Z",
    "2026-07-29T04:30:00.000Z",
  );
  assert.equal(preferred.hasConflict, false);
  assert.equal(preferred.outsidePreference, false);

  const outside = teacherScheduleConflict(
    events,
    "2026-07-29T05:30:00.000Z",
    "2026-07-29T06:30:00.000Z",
  );
  assert.equal(outside.hasConflict, false);
  assert.equal(outside.outsidePreference, true);
});
