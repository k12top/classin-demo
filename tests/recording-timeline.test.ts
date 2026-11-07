import assert from "node:assert/strict";
import test from "node:test";
import { endedLessonRecordingTime } from "../src/lib/classroom/recording-timeline";
import { getFinishedDelayMinutes } from "../src/lib/course-status";

const now = new Date("2026-11-08T00:00:00Z");
const start = new Date("2026-11-07T08:15:20.773Z");
const end = new Date("2026-11-07T10:00:00Z");
const recording = { createdAt: start, startedAt: start, stoppedAt: null, stopRequestedAt: null };
const lesson = { status: "finished", endedAt: null, endTime: end };

test("an automatically finished lesson supplies a stable deadline without a teacher stop", () => {
  assert.equal(endedLessonRecordingTime(recording, lesson, now)?.getTime(),
    end.getTime() + getFinishedDelayMinutes() * 60_000);
});
test("manual end, empty-room closure and cancellation use the actual end", () => {
  for (const status of ["afterClass", "finished", "cancelled"]) {
    assert.equal(endedLessonRecordingTime(recording, { ...lesson, status, endedAt: end }, now)?.getTime(), end.getTime());
  }
});
test("an earlier segment stop and existing media boundary are preserved", () => {
  const earlier = new Date(start.getTime() + 600_000);
  assert.equal(endedLessonRecordingTime({ ...recording, stopRequestedAt: earlier }, lesson, now)?.getTime(), earlier.getTime());
  assert.equal(endedLessonRecordingTime({ ...recording, stoppedAt: earlier }, lesson, now), earlier);
});
test("active, extended and reopened lessons do not receive a fabricated end", () => {
  for (const status of ["scheduled", "live"]) assert.equal(endedLessonRecordingTime(recording, { ...lesson, status }, now), null);
  const reopened = { ...recording, createdAt: now, startedAt: now };
  assert.equal(endedLessonRecordingTime(reopened, { ...lesson, endedAt: end }, now), null);
});
