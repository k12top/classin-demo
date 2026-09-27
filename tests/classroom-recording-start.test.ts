import assert from "node:assert/strict";
import test from "node:test";

import {
  canAutoStartRecordingAtStatus,
  shouldAutoStartRecordingAfterWhiteboard,
  shouldNotifyRecorderReady,
} from "../src/lib/classroom/recording-start";

const readyClassroom = {
  isRecorder: false,
  pageReady: true,
  mediaConnected: true,
  whiteboardEnabled: true,
  whiteboardReady: true,
  isTeacher: true,
  mode: "pageReady",
  status: "waiting",
};

test("page entry never starts automatic recording before the whiteboard opens", () => {
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
  assert.equal(shouldAutoStartRecordingAfterWhiteboard(readyClassroom), true);
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
  assert.equal(canAutoStartRecordingAtStatus("classStart", "ended"), false);
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
    whiteboardEnabled: true,
    whiteboardReady: false,
  }), false);
  assert.equal(shouldNotifyRecorderReady({
    pageReady: true,
    mediaConnected: true,
    whiteboardEnabled: true,
    whiteboardReady: true,
  }), true);
});
