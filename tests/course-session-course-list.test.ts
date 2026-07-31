import assert from "node:assert/strict";
import test from "node:test";
import { serializeCourse } from "../src/lib/course-serialize";
import { courseListStatusWhere } from "../src/lib/course-list-query";

test("course list status filters target lessons instead of legacy course status", () => {
  assert.deepEqual(courseListStatusWhere("live"), {
    sessions: { some: { status: "live" } },
  });
  assert.equal(courseListStatusWhere(null), undefined);
});

test("course summary follows the active lesson in a multi-lesson course", () => {
  const course = serializeCourse({
    id: "course-1",
    status: "finished",
    roomUuid: "legacy-room",
    roomType: 0,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
    endTime: new Date("2026-01-01T01:00:00.000Z"),
    sessions: [
      {
        id: "past",
        status: "finished",
        roomUuid: "past-room",
        roomType: 0,
        startTime: new Date("2026-07-28T01:00:00.000Z"),
        endTime: new Date("2026-07-28T02:00:00.000Z"),
      },
      {
        id: "current",
        status: "live",
        roomUuid: "current-room",
        roomType: 4,
        startTime: new Date("2026-07-29T01:00:00.000Z"),
        endTime: new Date("2026-07-29T02:00:00.000Z"),
      },
      {
        id: "future",
        status: "scheduled",
        roomUuid: "future-room",
        roomType: 2,
        startTime: new Date("2026-08-01T01:00:00.000Z"),
        endTime: new Date("2026-08-01T02:00:00.000Z"),
      },
    ],
  });

  assert.equal(course.status, "live");
  assert.equal(course.roomUuid, "current-room");
  assert.equal(course.nextSession?.id, "current");
  assert.equal(course.sessionCount, 3);
  assert.equal(course.completedSessionCount, 1);
});
