import assert from "node:assert/strict";
import test from "node:test";

import {
  canAutoStartRecordingAtStatus,
  normalizeRecordingStartMode,
  shouldAutoStartRecordingAfterWhiteboard,
  shouldNotifyRecorderReady,
  isRecorderReadyAcknowledged,
} from "../src/lib/classroom/recording-start";

const readyClassroom = {
  isRecorder: false,
  pageReady: true,
  mediaConnected: true,
  whiteboardEnabled: true,
  whiteboardReady: true,
  isTeacher: true,
  mode: "classStart",
  status: "waiting",
};

test("page entry never starts automatic recording before class and whiteboard are ready", () => {
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    whiteboardReady: false,
  }), false);
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    pageReady: false,
  }), false);
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    mediaConnected: false,
  }), false);
  assert.equal(shouldAutoStartRecordingAfterWhiteboard(readyClassroom), false);
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    status: "live",
  }), true);
});

test("pending provider startup does not count as a released recorder", () => {
  assert.equal(isRecorderReadyAcknowledged(202, "pending"), false);
  assert.equal(isRecorderReadyAcknowledged(200, "pending"), false);
  assert.equal(isRecorderReadyAcknowledged(503, undefined), false);
  assert.equal(isRecorderReadyAcknowledged(409, "stopped"), false);
  assert.equal(isRecorderReadyAcknowledged(200, "ready"), true);
});

test("start-class recording waits for both live state and an open whiteboard", () => {
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    mode: "classStart",
  }), false);
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    mode: "classStart",
    status: "live",
    whiteboardReady: false,
  }), false);
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    mode: "classStart",
    status: "live",
  }), true);
  assert.equal(canAutoStartRecordingAtStatus("pageReady", "ended"), false);
  assert.equal(canAutoStartRecordingAtStatus("pageReady", "waiting"), false);
  assert.equal(canAutoStartRecordingAtStatus("classStart", "ended"), false);
  assert.equal(canAutoStartRecordingAtStatus("scheduled", "waiting"), false);
  assert.equal(canAutoStartRecordingAtStatus("scheduledEarly", "live"), true);
});

test("legacy page-ready recording configuration normalizes to class start", () => {
  assert.equal(normalizeRecordingStartMode("pageReady"), "classStart");
});

test("student and recorder pages cannot launch automatic recording", () => {
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    isTeacher: false,
  }), false);
  assert.equal(shouldAutoStartRecordingAfterWhiteboard({
    ...readyClassroom,
    isRecorder: true,
  }), false);
});

test("cloud recorder does not announce readiness while its whiteboard loads", () => {
  assert.equal(shouldNotifyRecorderReady({
    pageReady: true,
    mediaConnected: true,
    whiteboardEnabled: false,
    whiteboardReady: false,
  }), false, "missing or failed credentials must not release the loading screen");
  assert.equal(shouldNotifyRecorderReady({
    pageReady: true,
    mediaConnected: true,
    whiteboardEnabled: true,
    whiteboardReady: false,
  }), false);
  assert.equal(shouldNotifyRecorderReady({
    pageReady: true,
    mediaConnected: true,
    whiteboardEnabled: true,
    whiteboardReady: true,
  }), true);
  assert.equal(shouldNotifyRecorderReady({
    pageReady: true,
    mediaConnected: true,
    whiteboardEnabled: false,
    whiteboardReady: false,
    whiteboardRequired: false,
  }), true, "a screen share or camera-only stage does not require a whiteboard");
  assert.equal(shouldNotifyRecorderReady({
    pageReady: true,
    mediaConnected: false,
    whiteboardEnabled: true,
    whiteboardReady: true,
    whiteboardRequired: false,
  }), false);
});
