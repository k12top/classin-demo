import assert from "node:assert/strict";
import { test } from "node:test";
import { getFinishedDelayMinutes, isFinishedDue } from "../src/lib/course-status";
import { classroomGraceEndAt } from "../src/lib/classroom/policy";

test("auto-end defaults to scheduled end plus 30 minutes with an inclusive deadline", () => {
  const previous = process.env.COURSE_FINISHED_DELAY_MINUTES;
  try {
    delete process.env.COURSE_FINISHED_DELAY_MINUTES;
    const end = new Date("2026-10-19T10:00:00Z");
    const deadline = new Date("2026-10-19T10:30:00Z");
    assert.equal(classroomGraceEndAt(end)?.toISOString(), deadline.toISOString());
    assert.equal(isFinishedDue(end, new Date(deadline.getTime() - 1)), false);
    assert.equal(isFinishedDue(end, deadline), true);
    process.env.COURSE_FINISHED_DELAY_MINUTES = "0";
    assert.equal(isFinishedDue(end, end), true);
    for (const invalid of ["", "-1", "invalid"]) {
      process.env.COURSE_FINISHED_DELAY_MINUTES = invalid;
      assert.equal(getFinishedDelayMinutes(), 30);
    }
    process.env.COURSE_FINISHED_DELAY_MINUTES = "15";
    assert.equal(classroomGraceEndAt(end)?.toISOString(), "2026-10-19T10:15:00.000Z");
    assert.equal(classroomGraceEndAt(null), null);
    assert.equal(isFinishedDue(null, deadline), false);
  } finally {
    if (previous === undefined) delete process.env.COURSE_FINISHED_DELAY_MINUTES;
    else process.env.COURSE_FINISHED_DELAY_MINUTES = previous;
  }
});
