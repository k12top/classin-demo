import assert from "node:assert/strict";
import test from "node:test";
import { classroomMaySendChat } from "../src/lib/classroom/policy";

test("student chat restrictions do not prevent teachers and assistants from speaking", () => {
  for (const role of ["teacher", "assistant"]) {
    for (const enabled of [true, false]) for (const muted of [true, false]) {
      assert.equal(classroomMaySendChat(role, enabled, muted), true);
    }
  }
  assert.equal(classroomMaySendChat("student", true, false), true);
  assert.equal(classroomMaySendChat("student", false, false), false);
  assert.equal(classroomMaySendChat("student", true, true), false);
  assert.equal(classroomMaySendChat("observer", true, false), false);
  assert.equal(classroomMaySendChat(undefined, true, false), false);
});
