import assert from "node:assert/strict";
import test from "node:test";
import { serializeCourse } from "../src/lib/course-serialize";
import { courseListStatusWhere } from "../src/lib/course-list-query";

test("course list status filters target lessons instead of legacy course status", () => {
  assert.deepEqual(courseListStatusWhere("live"), {
    sessions: { some: { status: "live", endedAt: null } },
  });
  assert.deepEqual(courseListStatusWhere("finished"), {
    sessions: {
      some: {
        OR: [
          { status: "finished" },
          { endedAt: { not: null }, status: { not: "cancelled" } },
        ],
      },
    },
  });
  assert.equal(courseListStatusWhere(null), undefined);
});

test("a manually ended lesson is presented as finished while future lessons remain upcoming", () => {
  const manuallyEnded = serializeCourse({
    id: "course-ended",
    status: "live",
    sessions: [
      {
        id: "ended",
        status: "afterClass",
        endedAt: new Date("2026-08-01T02:00:00.000Z"),
        roomUuid: "ended-room",
        roomType: 0,
        startTime: new Date("2026-08-01T01:00:00.000Z"),
        endTime: new Date("2026-08-01T03:00:00.000Z"),
      },
    ],
  });
  assert.equal(manuallyEnded.status, "finished");
  assert.equal(manuallyEnded.completedSessionCount, 1);

  const series = serializeCourse({
    id: "course-series",
    status: "live",
    sessions: [
      ...manuallyEnded.sessions,
      {
        id: "future",
        status: "scheduled",
        endedAt: null,
        roomUuid: "future-room",
        roomType: 4,
        startTime: new Date("2099-08-02T01:00:00.000Z"),
        endTime: new Date("2099-08-02T02:00:00.000Z"),
      },
    ],
  });
  assert.equal(series.status, "scheduled");
  assert.equal(series.nextSession?.id, "future");
  assert.equal(series.completedSessionCount, 1);
});

test("a cancelled lesson remains cancelled even though it has an end marker", () => {
  const course = serializeCourse({
    id: "course-cancelled",
    status: "cancelled",
    sessions: [
      {
        id: "cancelled",
        status: "cancelled",
        endedAt: new Date("2026-08-01T02:00:00.000Z"),
        roomUuid: "cancelled-room",
        roomType: 0,
        startTime: new Date("2026-08-01T01:00:00.000Z"),
        endTime: new Date("2026-08-01T03:00:00.000Z"),
      },
    ],
  });
  assert.equal(course.status, "cancelled");
  assert.equal(course.completedSessionCount, 0);
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

test("course playback is exposed only when a completed recording is available", () => {
  const withoutPlayback = serializeCourse({
    id: "course-no-playback",
    status: "finished",
    sessions: [
      {
        id: "lesson-no-playback",
        status: "finished",
        roomUuid: "lesson-no-playback-room",
        roomType: 0,
        startTime: new Date("2026-08-01T01:00:00.000Z"),
        endTime: new Date("2026-08-01T02:00:00.000Z"),
        _count: { recordings: 0 },
      },
    ],
  });
  assert.equal(withoutPlayback.hasPlayback, false);

  const withPlayback = serializeCourse({
    ...withoutPlayback,
    sessions: [
      {
        ...withoutPlayback.sessions[0],
        _count: { recordings: 1 },
      },
    ],
  });
  assert.equal(withPlayback.hasPlayback, true);
});
