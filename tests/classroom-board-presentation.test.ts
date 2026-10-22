import assert from "node:assert/strict";
import test from "node:test";
import { classroomBoardPresentation } from "../src/lib/classroom/board-presentation";
import { selectActiveScreenShare } from "../src/lib/classroom/media-routing";
import { recorderCameraParticipants } from "../src/lib/classroom/recorder-surface";
import type { ClassroomBoardItem, ClassroomMediaSnapshot, ClassroomMemberSnapshot, ClassroomParticipant } from "../src/lib/classroom/types";

const camera: ClassroomBoardItem = {
  id: "camera:student", kind: "camera", sourceId: "student", zIndex: 4,
  rect: { x: 0.37, y: 0.21, width: 0.25, height: 0.31 }, visible: true, locked: true, shape: "circle",
};
const hidden = new Set<string>();
const snapshot = (participants: ClassroomParticipant[] = [], sharing = false): ClassroomMediaSnapshot => ({
  connectionState: "connected", participants, focusedParticipantId: null,
  network: { uplinkQuality: 1, downlinkQuality: 1, latencyMs: 20, packetLossPercent: 0 },
  local: { microphoneOn: false, cameraOn: false, screenSharing: sharing },
});
const screen = { id: "screen-123", displayName: "Screen", isLocal: false, kind: "screen", hasAudio: false, hasVideo: true } as const;

test("local and remote main/room shares return board cameras to seats, then restore the exact layout", () => {
  const saved = [camera], before = JSON.stringify(saved);
  for (const [main, room, preferRoom] of [
    [snapshot([], true), snapshot(), false],
    [snapshot([screen]), snapshot(), false],
    [snapshot(), snapshot([], true), true],
    [snapshot(), snapshot([screen]), true],
  ] as const) {
    const share = selectActiveScreenShare({ main, room, preferRoom, mainScreenUserId: screen.id, roomScreenUserId: screen.id });
    assert.ok(share);
    const presentation = classroomBoardPresentation(saved, !share, hidden);
    assert.equal(presentation.boardItems.length, 0);
    assert.equal(presentation.cameraSourceIds.size, 0, "no seat may be hidden behind the screen overlay");
    const restored = classroomBoardPresentation(saved, true, hidden);
    assert.strictEqual(restored.boardItems[0], camera);
    assert.deepEqual([...restored.cameraSourceIds], ["student"]);
    assert.equal(JSON.stringify(saved), before, "screen transitions never mutate saved coordinates, shape, lock or order");
  }
});

test("hidden and invisible board cameras never remove their owners from the podium", () => {
  const items = [camera, { ...camera, id: "camera:other", sourceId: "other", visible: false }];
  const presentation = classroomBoardPresentation(items, true, new Set([camera.id]));
  assert.equal(presentation.cameraSourceIds.size, 0);
});

test("restoration follows the latest shared layout instead of replaying a stale backup", () => {
  const saved = [camera];
  classroomBoardPresentation(saved, false, hidden);
  const updated = { ...camera, rect: { ...camera.rect, x: 0.1 }, shape: "rounded" as const, locked: false };
  assert.strictEqual(classroomBoardPresentation([updated], true, hidden).boardItems[0], updated);
  assert.equal(classroomBoardPresentation([], true, hidden).boardItems.length, 0, "a removed camera must not reappear");
});

test("cancelled or unpublished screen capture keeps the existing board presentation", () => {
  const share = selectActiveScreenShare({ main: snapshot([{ ...screen, hasVideo: false }]), room: snapshot(), preferRoom: false });
  assert.equal(share, null);
  assert.deepEqual([...classroomBoardPresentation([camera], !share, hidden).cameraSourceIds], ["student"]);
});

test("recorder moves cameras to its podium during sharing and back to the board afterward", () => {
  const participants: ClassroomParticipant[] = [{ id: "101", kind: "camera", hasVideo: true, hasAudio: true, isLocal: false, displayName: "Student" }];
  const members = [{ userId: "student", role: "student", rtcUids: [101], onStage: true }] as ClassroomMemberSnapshot[];
  const board = classroomBoardPresentation([camera], true, hidden);
  assert.equal(recorderCameraParticipants(participants, members, board.boardItems, false).length, 0);
  const sharing = classroomBoardPresentation([camera], false, hidden);
  assert.equal(recorderCameraParticipants(participants, members, sharing.boardItems, true).length, 1);
  assert.equal(recorderCameraParticipants(participants, members, classroomBoardPresentation([camera], true, hidden).boardItems, false).length, 0);
});
