import assert from "node:assert/strict";
import test from "node:test";
import { classroomPresenceSummary } from "../src/lib/classroom/presence";
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


test("presence service uncertainty preserves last-known presence without granting stage or media rights", () => {
  const cached = [{ ...members[0], online: true, connectionStatus: "online" as const, lastSeenAt: new Date(0).toISOString(), reconnectUntil: new Date(120000).toISOString() }];
  const noRtc = { connectionState: "connected", participants: [] } as unknown as ClassroomMediaSnapshot;
  const unknown = reconcileClassroomRtcPresence(cached, noRtc, 600000, undefined, true);
  assert.equal(unknown, cached);
  assert.equal(unknown[0].cameraAllowed, false);
  assert.equal(unknown[0].onStage, false);
  assert.equal(reconcileClassroomRtcPresence(cached, noRtc, 600000)[0].connectionStatus, "offline");
});


test("attendance counts offstage people once and separates reconnecting and departed seats", () => {
  const student = members[0];
  const roster: ClassroomMemberSnapshot[] = [
    { ...student, userId: "teacher", role: "teacher", online: true },
    { ...student, userId: "assistant", role: "assistant", online: true },
    { ...student, userId: "offstage", online: true, rtcUids: [123, 124] },
    { ...student, userId: "reconnecting", connectionStatus: "reconnecting" },
    { ...student, userId: "departed", connectionStatus: "offline" },
  ];
  assert.deepEqual(classroomPresenceSummary(roster), { online: 3, students: 1, teachers: 1, assistants: 1, away: 1, reconnecting: 1 });
  const rejoined = roster.map(member => member.userId === "reconnecting" ? { ...member, online: true, connectionStatus: "online" as const } : member);
  assert.deepEqual(classroomPresenceSummary(rejoined), { online: 4, students: 2, teachers: 1, assistants: 1, away: 1, reconnecting: 0 });
  assert.deepEqual(classroomPresenceSummary([]), { online: 0, students: 0, teachers: 0, assistants: 0, away: 0, reconnecting: 0 });
});
