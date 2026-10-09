import assert from "node:assert/strict";
import test from "node:test";
import { normalizeClassroomComposition, placeClassroomBoardItem, defaultBoardRect } from "../src/lib/classroom/composition";
import { canShareClassroomScreen, ownsScreenShare } from "../src/lib/classroom/screen-share-state";
import { selectActiveScreenShare } from "../src/lib/classroom/media-routing";
import type { ClassroomMediaSnapshot } from "../src/lib/classroom/types";

test("being on stage does not grant screen sharing, and assistant management must be explicit", () => {
  const input = { role: "student" as const, studentSharingSupported: true,
    member: { onStage: true, stageState: "accepted", screenShareState: "idle" } };
  assert.equal(canShareClassroomScreen(input), false);
  assert.equal(canShareClassroomScreen({ ...input, member: { ...input.member, screenShareState: "requested" } }), false);
  const accepted = { ...input, member: { ...input.member, screenShareState: "accepted" } };
  assert.equal(canShareClassroomScreen(accepted), true);
  assert.equal(canShareClassroomScreen({ ...accepted, studentSharingSupported: false }), false);
  assert.equal(canShareClassroomScreen({ ...accepted, member: { ...accepted.member, onStage: false } }), false);
  assert.equal(canShareClassroomScreen({ ...input, role: "assistant" }), false);
  assert.equal(canShareClassroomScreen({ ...input, role: "assistant", assistantManagementAllowed: true }), true);
  assert.equal(canShareClassroomScreen({ ...input, role: "teacher" }), true);
});

test("the authorized publisher wins while a replaced RTC track is still present", () => {
  const main: ClassroomMediaSnapshot = { connectionState: "connected", local: { cameraOn: false, microphoneOn: false, screenSharing: false, videoQuality: "hd" },
    network: { uplinkQuality: 1, downlinkQuality: 1, latencyMs: null, packetLossPercent: null }, focusedParticipantId: null,
    participants: ["1000000001", "1000000002"].map(id => ({ id, displayName: id, kind: "screen", isLocal: false, hasVideo: true, hasAudio: false })) };
  const room = { ...main, participants: [] };
  assert.equal(selectActiveScreenShare({ main, room, preferRoom: false, mainAuthorizedScreenUid: "1000000002" })?.participant.id, "1000000002");
  assert.equal(selectActiveScreenShare({ main, room, preferRoom: false, mainAuthorizedScreenUid: null }), null);
  assert.equal(selectActiveScreenShare({ main, room, preferRoom: false, mainAuthorizedScreenUid: "1000000003" }), null);
});

test("composition edits retain publisher ownership and distinguish different tabs", () => {
  const lease = { userId: "teacher", clientId: "client-123", rtcUid: 1000000001, claimId: "claim-123" };
  const composition = normalizeClassroomComposition({ screenShares: { main: lease } });
  const placed = placeClassroomBoardItem(composition, { id: "camera:teacher", kind: "camera", sourceId: "teacher", rect: defaultBoardRect("camera"), visible: true, locked: false });
  assert.deepEqual(placed.screenShares, { main: lease });
  assert.equal(ownsScreenShare(lease, "teacher", "client-123"), true);
  assert.equal(ownsScreenShare(lease, "teacher", "client-456"), false);
  assert.deepEqual(normalizeClassroomComposition({ screenShares: { main: { ...lease, rtcUid: 42 } } }).screenShares, {});
});
