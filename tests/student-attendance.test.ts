import assert from "node:assert/strict";
import test from "node:test";
import { summarizeStudentAttendance } from "../src/lib/student-attendance";

const now = new Date("2026-07-30T12:00:00.000Z");

test("student attendance distinguishes present, late, partial and absent lessons", () => {
  const result = summarizeStudentAttendance(
    [
      {
        id: "present",
        title: "Present",
        status: "finished",
        startTime: new Date("2026-07-26T08:00:00.000Z"),
        endTime: new Date("2026-07-26T09:00:00.000Z"),
      },
      {
        id: "late",
        title: "Late",
        status: "finished",
        startTime: new Date("2026-07-27T08:00:00.000Z"),
        endTime: new Date("2026-07-27T09:00:00.000Z"),
      },
      {
        id: "partial",
        title: "Partial",
        status: "finished",
        startTime: new Date("2026-07-28T08:00:00.000Z"),
        endTime: new Date("2026-07-28T09:00:00.000Z"),
      },
      {
        id: "absent",
        title: "Absent",
        status: "finished",
        startTime: new Date("2026-07-29T08:00:00.000Z"),
        endTime: new Date("2026-07-29T09:00:00.000Z"),
      },
    ],
    [
      {
        sessionId: "present",
        enteredAt: new Date("2026-07-26T08:02:00.000Z"),
        leftAt: new Date("2026-07-26T08:57:00.000Z"),
        durationSec: 3300,
      },
      {
        sessionId: "late",
        enteredAt: new Date("2026-07-27T08:15:00.000Z"),
        leftAt: new Date("2026-07-27T09:00:00.000Z"),
        durationSec: 2700,
      },
      {
        sessionId: "partial",
        enteredAt: new Date("2026-07-28T08:01:00.000Z"),
        leftAt: new Date("2026-07-28T08:20:00.000Z"),
        durationSec: 1140,
      },
    ],
    [],
    now,
  );

  assert.deepEqual(result.lessons.map((lesson) => lesson.status), [
    "present",
    "late",
    "partial",
    "absent",
  ]);
  assert.equal(result.summary.completedLessonCount, 4);
  assert.equal(result.summary.attendedLessonCount, 3);
  assert.equal(result.summary.attendanceRate, 0.75);
  assert.equal(result.summary.lateLessonCount, 1);
  assert.equal(result.summary.currentStreak, 0);
});

test("future and cancelled lessons do not reduce attendance rate", () => {
  const result = summarizeStudentAttendance(
    [
      {
        id: "future",
        title: "Future",
        status: "scheduled",
        startTime: new Date("2026-08-01T08:00:00.000Z"),
        endTime: new Date("2026-08-01T09:00:00.000Z"),
      },
      {
        id: "cancelled",
        title: "Cancelled",
        status: "cancelled",
        startTime: new Date("2026-07-28T08:00:00.000Z"),
        endTime: new Date("2026-07-28T09:00:00.000Z"),
      },
    ],
    [],
    [],
    now,
  );

  assert.equal(result.lessons[0].status, "cancelled");
  assert.equal(result.lessons[1].status, "upcoming");
  assert.equal(result.summary.completedLessonCount, 0);
  assert.equal(result.summary.attendanceRate, 0);
});

test("approved leave is marked excused and excluded from attendance rate", () => {
  const result = summarizeStudentAttendance(
    [
      {
        id: "excused",
        title: "Excused",
        status: "finished",
        startTime: new Date("2026-07-28T08:00:00.000Z"),
        endTime: new Date("2026-07-28T09:00:00.000Z"),
      },
      {
        id: "present",
        title: "Present",
        status: "finished",
        startTime: new Date("2026-07-29T08:00:00.000Z"),
        endTime: new Date("2026-07-29T09:00:00.000Z"),
      },
    ],
    [
      {
        sessionId: "present",
        enteredAt: new Date("2026-07-29T08:01:00.000Z"),
        leftAt: new Date("2026-07-29T08:58:00.000Z"),
        durationSec: 3420,
      },
    ],
    [{ sessionId: "excused", active: true }],
    now,
  );

  assert.deepEqual(result.lessons.map((lesson) => lesson.status), ["excused", "present"]);
  assert.equal(result.summary.excusedLessonCount, 1);
  assert.equal(result.summary.completedLessonCount, 1);
  assert.equal(result.summary.absentLessonCount, 0);
  assert.equal(result.summary.attendanceRate, 1);
});

test("actual attendance takes precedence over active leave", () => {
  const result = summarizeStudentAttendance(
    [
      {
        id: "lesson",
        title: "Lesson",
        status: "finished",
        startTime: new Date("2026-07-29T08:00:00.000Z"),
        endTime: new Date("2026-07-29T09:00:00.000Z"),
      },
    ],
    [
      {
        sessionId: "lesson",
        enteredAt: new Date("2026-07-29T08:02:00.000Z"),
        leftAt: new Date("2026-07-29T08:58:00.000Z"),
        durationSec: 3360,
      },
    ],
    [{ sessionId: "lesson", active: true }],
    now,
  );

  assert.equal(result.lessons[0].status, "present");
  assert.equal(result.summary.excusedLessonCount, 0);
  assert.equal(result.summary.attendedLessonCount, 1);
});
