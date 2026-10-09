import assert from "node:assert/strict";
import test from "node:test";
import { reconcileClassroomRtcPresence } from "../src/lib/classroom/rtc-presence";
import type { ClassroomMediaSnapshot, ClassroomMemberSnapshot } from "../src/lib/classroom/types";

const members: ClassroomMemberSnapshot[] = [{ userId: "student", displayName: "Student", avatar: "", role: "student", online: false, onStage: false, stageState: "offstage", screenShareState: "idle", screenShareRequestedAt: null, microphoneAllowed: false, cameraAllowed: false, chatMuted: true, whiteboardWritable: false, handRaisedAt: null, rewardCount: 0, rtcUids: [123] }];
function media(state: ClassroomMediaSnapshot["connectionState"], kind = "camera") {
  return { connectionState: state, participants: [{ id: "123", kind, hasAudio: false, hasVideo: false }] } as ClassroomMediaSnapshot;
}

test("an RTC-connected member remains visible after heartbeat expiry with every grant unchanged", () => {
  const result = reconcileClassroomRtcPresence(members, media("connected"));
  assert.deepEqual(result, [{ ...members[0], online: true }]);
  assert.equal(members[0].online, false);
});

test("disconnected, unknown, screen and auxiliary publishers cannot assert member presence", () => {
  assert.equal(reconcileClassroomRtcPresence(members, media("disconnected")), members);
  for (const kind of ["screen", "auxiliary-camera"]) assert.deepEqual(reconcileClassroomRtcPresence(members, media("connected", kind)), members);
  assert.deepEqual(reconcileClassroomRtcPresence([{ ...members[0], rtcUids: [] }], media("connected")), [{ ...members[0], rtcUids: [] }]);
});
