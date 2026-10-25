import assert from "node:assert/strict";
import test from "node:test";
import { classroomAuxiliaryRtcUid, classroomRtcUid, isClassroomAuxiliaryRtcUid, isClassroomScreenRtcUid } from "../src/lib/classroom/rtc-uid";
import { participantOwnerId } from "../src/lib/classroom/participant-identity";
import { defaultBoardRect, emptyClassroomComposition, normalizeClassroomComposition, placeClassroomBoardItem, updateClassroomBoardItem } from "../src/lib/classroom/composition";

test("auxiliary identities fit uint32 without overlapping cameras, screens, captions or recorders", () => {
  for (const identity of ["teacher", "teacher:device-a", "teacher:device-b", "student:device-a"]) {
    const camera = classroomRtcUid(identity, "camera");
    const auxiliary = classroomAuxiliaryRtcUid(camera);
    assert.equal(auxiliary, classroomAuxiliaryRtcUid(camera));
    assert.ok(auxiliary > 4_000_000_000 && auxiliary <= 4_294_967_295);
    assert.equal(isClassroomAuxiliaryRtcUid(String(auxiliary)), true);
    assert.equal(isClassroomScreenRtcUid(String(auxiliary)), false);
    for (const kind of ["camera", "screen", "stt-subscriber", "stt-publisher", "recorder"] as const) assert.equal(isClassroomAuxiliaryRtcUid(String(classroomRtcUid(identity, kind))), false);
  }
  assert.throws(() => classroomAuxiliaryRtcUid(0));
  assert.throws(() => classroomAuxiliaryRtcUid(1_000_000_001));
  assert.equal(isClassroomAuxiliaryRtcUid("4294967296"), false);
});

test("auxiliary feeds map to their member across multiple connections and older room payloads", () => {
  const first = classroomRtcUid("teacher:device-a", "camera");
  const second = classroomRtcUid("teacher:device-b", "camera");
  const members = [{ userId: "teacher", rtcUids: [first, second], auxiliaryCameraUids: [classroomAuxiliaryRtcUid(first), classroomAuxiliaryRtcUid(second)] }];
  for (const camera of [first, second]) assert.equal(participantOwnerId(String(classroomAuxiliaryRtcUid(camera)), members), "teacher");
  assert.equal(participantOwnerId(String(classroomAuxiliaryRtcUid(first)), [{ userId: "teacher", rtcUids: [first] }]), "teacher");
  assert.equal(participantOwnerId(String(classroomAuxiliaryRtcUid(classroomRtcUid("teacher", "camera"))), [{ userId: "teacher" }]), "teacher");
  assert.equal(participantOwnerId("teacher::auxiliary-camera"), "teacher");
  assert.equal(participantOwnerId("unknown", members), "unknown");
});

test("a member's main and auxiliary cameras persist independently on the whiteboard", () => {
  let composition = emptyClassroomComposition();
  for (const kind of ["camera", "auxiliary-camera"] as const) composition = placeClassroomBoardItem(composition, { id: `${kind}:teacher`, kind, sourceId: "teacher", rect: defaultBoardRect(kind), locked: false, visible: true, ...(kind === "auxiliary-camera" ? { rtcUid: classroomAuxiliaryRtcUid(100) } : {}) });
  assert.equal(composition.boardItems.length, 2);
  const saved = normalizeClassroomComposition(JSON.parse(JSON.stringify(composition)));
  assert.equal(saved.boardItems[1].kind, "auxiliary-camera");
  assert.equal(saved.boardItems[1].rtcUid, classroomAuxiliaryRtcUid(100));
  const moved = updateClassroomBoardItem(saved, "auxiliary-camera:teacher", { rect: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 } });
  assert.deepEqual(moved.boardItems[0], saved.boardItems[0]);
  assert.equal(moved.boardItems[1].rect.x, 0.2);
  const replaced = placeClassroomBoardItem(moved, { ...moved.boardItems[1], id: "auxiliary-camera:new" });
  assert.equal(replaced.boardItems.length, 2);
  assert.equal(replaced.boardItems[0].kind, "camera");
});
