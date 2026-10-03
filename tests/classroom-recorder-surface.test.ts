import assert from "node:assert/strict";
import test from "node:test";
import { recorderCameraParticipants, recorderVideosHaveFrames } from "../src/lib/classroom/recorder-surface";
import type { ClassroomBoardItem, ClassroomMemberSnapshot, ClassroomParticipant } from "../src/lib/classroom/types";

const members = [
  { userId: "teacher", role: "teacher", onStage: true, rtcUids: [101] },
  { userId: "student", role: "student", onStage: true, rtcUids: [102] },
  { userId: "audience", role: "student", onStage: false, rtcUids: [103] },
] as ClassroomMemberSnapshot[];
const participant = (id: string, options: Partial<ClassroomParticipant> = {}): ClassroomParticipant => ({
  id, displayName: id, kind: "camera", isLocal: false, hasAudio: true, hasVideo: true, ...options,
});
const camera: ClassroomBoardItem = {
  id: "camera:teacher", kind: "camera", sourceId: "teacher", visible: true,
  rect: { x: 0, y: 0, width: 0.3, height: 0.3 }, zIndex: 1, locked: false,
};

test("recorder includes the podium cameras independently of hidden teaching controls", () => {
  assert.deepEqual(recorderCameraParticipants([
    participant("102"), participant("101"), participant("103"),
    participant("recorder", { isLocal: true }),
    participant("screen", { kind: "screen" }),
    participant("camera-off", { hasVideo: false }),
  ], members, [], false).map((p) => p.id), ["101", "102"]);
});

test("composed cameras are recorded once, and return when a screen covers the whiteboard", () => {
  const participants = [participant("101"), participant("102")];
  assert.deepEqual(recorderCameraParticipants(participants, members, [camera], false).map((p) => p.id), ["102"]);
  assert.deepEqual(recorderCameraParticipants(participants, members, [camera], true).map((p) => p.id), ["101", "102"]);
  assert.equal(recorderCameraParticipants(participants, members, [{ ...camera, visible: false }], false).length, 2);
});

test("a camera arriving before its member snapshot remains available to the recorder", () => {
  assert.equal(recorderCameraParticipants([participant("new-publisher")], [], [], false).length, 1);
});

test("recording waits for decoded visible videos and ignores hidden classroom surfaces", () => {
  const surface = (video: unknown, visible = true) => ({
    getBoundingClientRect: () => ({ width: visible ? 160 : 0, height: visible ? 90 : 0 }),
    querySelector: () => video,
  });
  const root = (...surfaces: unknown[]) => ({ querySelectorAll: () => surfaces }) as unknown as HTMLElement;
  const frame = { readyState: 2, videoWidth: 640, videoHeight: 360 };
  assert.equal(recorderVideosHaveFrames(root(surface(frame), surface(null, false))), true);
  assert.equal(recorderVideosHaveFrames(root(surface(null))), false);
  assert.equal(recorderVideosHaveFrames(root(surface({ ...frame, readyState: 1 }))), false);
  assert.equal(recorderVideosHaveFrames(root(surface({ ...frame, videoWidth: 0 }))), false);
  assert.equal(recorderVideosHaveFrames(root()), true);
});
