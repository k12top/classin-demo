import assert from "node:assert/strict";
import test from "node:test";
import { classroomRuntimeDefaults } from "../src/lib/classroom/config";
import { shouldRecoverRecording } from "../src/lib/classroom/recording-continuity";

test("keeps all classroom media credentials within the six-hour lesson window", () => {
  assert.equal(classroomRuntimeDefaults.rtcTokenTtlSeconds, 6 * 60 * 60);
  assert.equal(classroomRuntimeDefaults.recordingTokenTtlSeconds, 6 * 60 * 60);
  assert.equal(classroomRuntimeDefaults.recorderPageTokenTtl, "6h");
  assert.equal(classroomRuntimeDefaults.recordingMaxDurationHours, 6);
  assert.equal(classroomRuntimeDefaults.recordingSegmentDurationSeconds, 60 * 60);
});

test("recovers only unexpected live recorder failures", () => {
  assert.equal(
    shouldRecoverRecording(
      {
        status: "failed",
        failureStage: "runtime",
        stopRequestedAt: null,
        retryCount: 1,
      },
      3,
    ),
    true,
  );
  assert.equal(
    shouldRecoverRecording(
      {
        status: "failed",
        failureStage: "stop",
        stopRequestedAt: new Date(),
        retryCount: 0,
      },
      3,
    ),
    false,
  );
  assert.equal(
    shouldRecoverRecording(
      {
        status: "failed",
        failureStage: "runtime",
        stopRequestedAt: null,
        retryCount: 3,
      },
      3,
    ),
    false,
  );
});
