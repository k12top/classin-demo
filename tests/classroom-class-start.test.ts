import assert from "node:assert/strict";
import test from "node:test";
import { classStartLateness, classStartReadiness, normalizeClassStartMode, scheduledClassStartDue } from "../src/lib/classroom/class-start";

const start = new Date("2026-10-18T09:00:00Z"), end = new Date("2026-10-18T10:00:00Z");
test("class start defaults to reminders and never starts early or after the lesson", () => {
  for (const mode of [undefined, "", "classStart", "scheduledEarly", "disabled"]) assert.equal(normalizeClassStartMode(mode), "manual");
  assert.equal(scheduledClassStartDue("manual", start, end, start), false);
  assert.equal(scheduledClassStartDue("scheduled", start, end, new Date(+start - 1)), false);
  assert.equal(scheduledClassStartDue("scheduled", start, end, start), true);
  assert.equal(scheduledClassStartDue("scheduled", start, end, new Date(+start + 60_000)), true);
  assert.equal(scheduledClassStartDue("scheduled", start, end, end), false);
});
test("auto-start requires the lead teacher and the relevant teaching surfaces, independently of recording", () => {
  const ready = { isTeacher: true, isRecorder: false, pageReady: true, mediaConnected: true, whiteboardRequired: true, whiteboardReady: true };
  assert.equal(classStartReadiness(ready), true);
  for (const patch of [{ isTeacher: false }, { isRecorder: true }, { pageReady: false }, { mediaConnected: false }, { whiteboardReady: false }]) assert.equal(classStartReadiness({ ...ready, ...patch }), false);
  assert.equal(classStartReadiness({ ...ready, whiteboardRequired: false, whiteboardReady: false }), true, "a broadcast without a whiteboard can start");
});
test("lateness is separate from the actual class duration", () => {
  assert.equal(classStartLateness(null, +start), null);
  assert.equal(classStartLateness("invalid", +start), null);
  assert.equal(classStartLateness(start.toISOString(), +start - 1), null);
  assert.equal(classStartLateness(start.toISOString(), +start), 0);
  assert.equal(classStartLateness(start.toISOString(), +start + 125_000), 2);
});
