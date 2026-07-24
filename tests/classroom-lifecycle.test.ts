import assert from "node:assert/strict";
import {
  canSyncAgoraAfterClass,
  classroomDurationSeconds,
  classroomLifecycleDefaults,
} from "../src/lib/classroom-lifecycle";

const now = new Date("2026-07-24T08:00:00.000Z");

assert.equal(
  classroomDurationSeconds("2026-07-24T09:30:00.000Z", now),
  90 * 60,
);
assert.equal(
  classroomDurationSeconds("2026-07-24T07:30:00.000Z", now),
  classroomLifecycleDefaults.minimumDurationSeconds,
);
assert.equal(
  classroomDurationSeconds(null, now),
  classroomLifecycleDefaults.durationSeconds,
);
assert.equal(
  classroomDurationSeconds("invalid", now),
  classroomLifecycleDefaults.durationSeconds,
);

assert.equal(
  canSyncAgoraAfterClass("2026-07-24T09:30:00.000Z", now),
  false,
);
assert.equal(
  canSyncAgoraAfterClass("2026-07-24T08:00:00.000Z", now),
  true,
);
assert.equal(canSyncAgoraAfterClass(null, now), true);
