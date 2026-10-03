import assert from "node:assert/strict";
import test from "node:test";
import { classroomRuntimeDefaults } from "../src/lib/classroom/config";
import { shouldRecoverRecording } from "../src/lib/classroom/recording-continuity";
import { recorderPageOrigin } from "../src/lib/classroom/recorder-origin";

test("web recorder loads the deployment that started a preview recording", () => {
  const env = {
    CLASSROOM_PUBLIC_BASE_URL: "https://live.example.com",
    VERCEL_ENV: "preview",
    VERCEL_URL: "classroom-preview.vercel.app",
  };
  assert.equal(
    recorderPageOrigin(env),
    "https://classroom-preview.vercel.app",
  );
  assert.equal(
    recorderPageOrigin({ ...env, VERCEL_ENV: "production" }),
    "https://live.example.com",
  );
});

test("keeps all classroom media credentials within the six-hour lesson window", () => {
  assert.equal(classroomRuntimeDefaults.rtcTokenTtlSeconds, 6 * 60 * 60);
  assert.equal(classroomRuntimeDefaults.recordingTokenTtlSeconds, 6 * 60 * 60);
  assert.equal(classroomRuntimeDefaults.recorderPageTokenTtl, "6h");
  assert.equal(classroomRuntimeDefaults.recordingMaxDurationHours, 6);
  assert.equal(classroomRuntimeDefaults.recordingSegmentDurationSeconds, 4 * 60);
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
