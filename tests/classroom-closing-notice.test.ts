import assert from "node:assert/strict";
import { test } from "node:test";
import { classroomClosingNotice, classroomClosingClock } from "../src/lib/classroom/closing-notice";
import { getFinishedDelayMinutes, isFinishedDue } from "../src/lib/course-status";
import { classroomGraceEndAt } from "../src/lib/classroom/policy";

const end = Date.parse("2026-10-10T02:00:00.000Z");
const input = { scheduledEndTime: new Date(end).toISOString(), graceEndsAt: new Date(end + 30 * 60_000).toISOString(), status: "live" };

test("scheduled end begins a visible grace period without ending the class", () => {
  assert.equal(classroomClosingNotice({ ...input, now: end - 1 }), null);
  assert.deepEqual(classroomClosingNotice({ ...input, now: end }), { closesAt: input.graceEndsAt, remainingSeconds: 1800, phase: "grace" });
  assert.equal(isFinishedDue(new Date(end), new Date(end), 30), false);
  assert.equal(classroomClosingNotice({ ...input, now: end + 999 })?.remainingSeconds, 1800);
  assert.equal(classroomClosingNotice({ ...input, now: end + 1000 })?.remainingSeconds, 1799);
});

test("closing warnings use exact five-minute and one-minute boundaries, then wait for the server", () => {
  for (const [remaining, phase] of [[301, "grace"], [300, "warning"], [61, "warning"], [60, "final"], [1, "final"], [0, "closing"], [-30, "closing"]] as const) {
    const notice = classroomClosingNotice({ ...input, now: end + 30 * 60_000 - remaining * 1000 });
    assert.equal(notice?.phase, phase); assert.equal(notice?.remainingSeconds, Math.max(0, remaining));
  }
  assert.equal(classroomClosingNotice({ ...input, status: "ended", now: end + 30 * 60_000 }), null);
});

test("custom and rescheduled server deadlines are displayed instead of a hardcoded half hour", () => {
  const updated = { ...input, graceEndsAt: new Date(end + 45 * 60_000).toISOString() };
  assert.equal(classroomClosingNotice({ ...updated, now: end + 5 * 60_000 })?.remainingSeconds, 2400);
  assert.equal(classroomClosingNotice({ ...input, scheduledEndTime: new Date(end + 60_000).toISOString(), now: end }), null);
  assert.equal(classroomClosingClock(1800), "30:00");
  assert.equal(classroomClosingClock(61), "01:01");
  assert.equal(classroomClosingClock(0), "00:00");
});

test("missing or invalid scheduling data never starts a misleading closure timer", () => {
  for (const changes of [{ graceEndsAt: null }, { scheduledEndTime: null }, { graceEndsAt: "invalid" }, { scheduledEndTime: "invalid" }, { graceEndsAt: new Date(end - 1).toISOString() }, { now: Number.NaN }]) {
    assert.equal(classroomClosingNotice({ ...input, now: end, ...changes }), null);
  }
});

test("default closure and access policies share a thirty-minute grace period and preserve explicit configuration", () => {
  const previous = process.env.COURSE_FINISHED_DELAY_MINUTES;
  try {
    delete process.env.COURSE_FINISHED_DELAY_MINUTES;
    assert.equal(getFinishedDelayMinutes(), 30);
    assert.equal(classroomGraceEndAt(new Date(end))?.getTime(), end + 30 * 60_000);
    assert.equal(isFinishedDue(new Date(end), new Date(end + 30 * 60_000 - 1)), false);
    assert.equal(isFinishedDue(new Date(end), new Date(end + 30 * 60_000)), true);
    process.env.COURSE_FINISHED_DELAY_MINUTES = "invalid";
    assert.equal(getFinishedDelayMinutes(), 30);
    process.env.COURSE_FINISHED_DELAY_MINUTES = "20";
    assert.equal(getFinishedDelayMinutes(), 20);
    assert.equal(classroomGraceEndAt(new Date(end))?.getTime(), end + 20 * 60_000);
  } finally {
    if (previous === undefined) delete process.env.COURSE_FINISHED_DELAY_MINUTES;
    else process.env.COURSE_FINISHED_DELAY_MINUTES = previous;
  }
});
