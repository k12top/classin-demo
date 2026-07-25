import assert from "node:assert/strict";
import {
  canSyncAgoraAfterClass,
  classroomDurationSeconds,
  classroomLaunchSchedule,
  classroomLifecycleDefaults,
} from "../src/lib/classroom-lifecycle";

const now = new Date("2026-07-24T08:00:00.000Z");

assert.equal(
  classroomDurationSeconds("2026-07-24T09:30:00.000Z", now),
  110 * 60,
);
assert.equal(
  classroomDurationSeconds("2026-07-24T07:50:00.000Z", now),
  10 * 60,
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

const configuredSchedule = classroomLaunchSchedule(
  "2026-07-24T08:00:00.000Z",
  "2026-07-24T09:30:00.000Z",
  new Date("2026-07-24T08:45:00.000Z"),
);
assert.deepEqual(configuredSchedule, {
  startTimeMs: now.getTime(),
  durationSeconds: 90 * 60,
  closeDelaySeconds: 20 * 60,
});

const scheduleWithoutStart = classroomLaunchSchedule(
  null,
  "2026-07-24T09:30:00.000Z",
  now,
);
assert.deepEqual(scheduleWithoutStart, {
  startTimeMs: now.getTime(),
  durationSeconds: 90 * 60,
  closeDelaySeconds: 20 * 60,
});

const scheduleWithoutEnd = classroomLaunchSchedule(
  "2026-07-24T08:00:00.000Z",
  null,
  now,
);
assert.deepEqual(scheduleWithoutEnd, {
  startTimeMs: now.getTime(),
  durationSeconds: classroomLifecycleDefaults.durationSeconds,
  closeDelaySeconds: 20 * 60,
});

const scheduleOverAgoraLimit = classroomLaunchSchedule(
  "2026-07-24T08:00:00.000Z",
  "2026-07-26T08:00:00.000Z",
  now,
);
assert.deepEqual(scheduleOverAgoraLimit, {
  startTimeMs: now.getTime(),
  durationSeconds: classroomLifecycleDefaults.maximumDurationSeconds,
  closeDelaySeconds: 20 * 60,
});

assert.equal(
  classroomLifecycleDefaults.overtimeAllowanceSeconds,
  20 * 60,
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
