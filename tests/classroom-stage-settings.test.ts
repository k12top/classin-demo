import assert from "node:assert/strict";
import test from "node:test";
import { classroomModePolicy } from "../src/lib/classroom/mode";
import { classroomStudentStageLimit, validStageStudentLimit } from "../src/lib/classroom/stage-settings";
import { classroomActionCanRetry } from "../src/lib/classroom/action-request";

test("legacy lessons retain mode defaults and a lesson override survives every classroom mode", () => {
  for (const [roomType, expected] of [[0, 1], [4, null], [2, 30], [10, 30]] as const) {
    const mode = classroomModePolicy(roomType);
    assert.equal(classroomStudentStageLimit(mode, undefined), expected);
    assert.equal(classroomStudentStageLimit(mode, { stageStudentLimit: null }), expected);
    assert.equal(classroomStudentStageLimit(mode, { stageStudentLimit: 12 }), 12);
  }
});

test("only bounded integer limits are accepted and absolute setting requests may retry", () => {
  for (const valid of [1, 6, 9, 100]) assert.equal(validStageStudentLimit(valid), true);
  for (const invalid of [0, -1, 101, 3.5, NaN, Infinity, "9", null, undefined]) assert.equal(validStageStudentLimit(invalid), false);
  assert.equal(classroomActionCanRetry({ type: "setStageSettings", studentLimit: 9, inviteBypassLimit: true }), true);
});
