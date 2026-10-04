import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgoraTranscriptionStatus } from "../src/lib/classroom/transcription/agora-stt-status";

test("normalizes Shengwang transcription lifecycle states", () => {
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "STARTING" }), "starting");
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "RUNNING" }), "running");
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "RECOVERING" }), "recovering");
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "STOPPING" }), "stopping");
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "STOPPED" }), "stopped");
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "FAILED" }), "failed");
});

test("supports alternate translation service status vocabulary", () => {
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "PREPARING" }), "starting");
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "STARTED" }), "running");
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "IN_PROGRESS" }), "running");
  assert.equal(normalizeAgoraTranscriptionStatus({ status: "FAILURE_STOP" }), "failed");
});
