import assert from "node:assert/strict";
import test from "node:test";

import { selectActiveScreenShare } from "../src/lib/classroom/media-routing";
import type {
  ClassroomMediaSnapshot,
  ClassroomParticipant,
} from "../src/lib/classroom/types";

function participant(
  id: string,
  kind: ClassroomParticipant["kind"],
  hasVideo = true,
): ClassroomParticipant {
  return {
    id,
    displayName: id,
    isLocal: false,
    kind,
    hasAudio: false,
    hasVideo,
  };
}

function snapshot(
  participants: ClassroomParticipant[],
  screenSharing = false,
): ClassroomMediaSnapshot {
  return {
    connectionState: "connected",
    participants,
    network: {
      uplinkQuality: 1,
      downlinkQuality: 1,
      latencyMs: null,
      packetLossPercent: null,
    },
    local: {
      microphoneOn: false,
      cameraOn: false,
      screenSharing,
      videoQuality: "hd",
    },
    focusedParticipantId: null,
  };
}

test("main classroom screen share replaces the whiteboard", () => {
  const selected = selectActiveScreenShare({
    main: snapshot([
      participant("teacher-camera", "camera"),
      participant("teacher-screen", "screen"),
    ]),
    room: snapshot([]),
    preferRoom: false,
  });

  assert.equal(selected?.participant.id, "teacher-screen");
  assert.equal(selected?.source, "main");
});

test("room screen share uses the room provider and wins over the main channel", () => {
  const selected = selectActiveScreenShare({
    main: snapshot([participant("teacher-screen", "screen")]),
    room: snapshot([
      participant("student-camera", "camera"),
      participant("student-screen", "screen"),
    ]),
    preferRoom: true,
  });

  assert.equal(selected?.participant.id, "student-screen");
  assert.equal(selected?.source, "room");
});

test("a room member still receives the main teacher share as fallback", () => {
  const selected = selectActiveScreenShare({
    main: snapshot([participant("teacher-screen", "screen")]),
    room: snapshot([participant("student-camera", "camera")]),
    preferRoom: true,
  });

  assert.equal(selected?.participant.id, "teacher-screen");
  assert.equal(selected?.source, "main");
});

test("camera and unpublished screen tracks do not replace the whiteboard", () => {
  const selected = selectActiveScreenShare({
    main: snapshot([
      participant("teacher-camera", "camera"),
      participant("teacher-screen", "screen", false),
    ]),
    room: snapshot([]),
    preferRoom: false,
  });

  assert.equal(selected, null);
});

test("local main screen track replaces the whiteboard before its participant is listed", () => {
  const selected = selectActiveScreenShare({
    main: snapshot([participant("teacher-camera", "camera")], true),
    room: snapshot([]),
    preferRoom: false,
    mainScreenUserId: "teacher-screen",
  });

  assert.equal(selected?.participant.id, "teacher-screen");
  assert.equal(selected?.participant.isLocal, true);
  assert.equal(selected?.source, "main");
});

test("local room screen track uses its room credential before participant propagation", () => {
  const selected = selectActiveScreenShare({
    main: snapshot([participant("teacher-screen", "screen")]),
    room: snapshot([participant("student-camera", "camera")], true),
    preferRoom: true,
    roomScreenUserId: "student-screen",
  });

  assert.equal(selected?.participant.id, "student-screen");
  assert.equal(selected?.source, "room");
});
