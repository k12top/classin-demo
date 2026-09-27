import assert from "node:assert/strict";
import test from "node:test";
import {
  classroomRtcUid,
  isClassroomScreenRtcUid,
} from "../src/lib/classroom/rtc-uid";

test("classroom RTC identities are stable numeric UIDs in separate publisher ranges", () => {
  const identity = "4c471ee5-7cff-4372-9435-fed7bfec107d";
  const camera = classroomRtcUid(identity, "camera");
  const screen = classroomRtcUid(identity, "screen");
  const subscriber = classroomRtcUid(identity, "stt-subscriber");
  const publisher = classroomRtcUid(identity, "stt-publisher");
  const recorder = classroomRtcUid(identity, "recorder");

  assert.equal(camera, classroomRtcUid(identity, "camera"));
  assert.deepEqual(new Set([camera, screen, subscriber, publisher, recorder]).size, 5);
  assert.ok([camera, screen, subscriber, publisher, recorder].every(
    (uid) => Number.isInteger(uid) && uid > 0 && uid <= 4_294_967_295,
  ));
  assert.equal(isClassroomScreenRtcUid(String(screen)), true);
  assert.equal(isClassroomScreenRtcUid(String(camera)), false);
  assert.equal(isClassroomScreenRtcUid(String(publisher)), false);
});
