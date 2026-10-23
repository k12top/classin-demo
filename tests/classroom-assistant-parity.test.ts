import assert from "node:assert/strict";
import test from "node:test";
import { classroomCapabilities, isClassroomTeachingRole } from "../src/lib/classroom/policy";
import { classroomModePolicy } from "../src/lib/classroom/mode";
import { canShareClassroomScreen } from "../src/lib/classroom/screen-share-state";

test("lesson assistant has the full teacher capability set in every room mode, including legacy revoked maps", () => {
  for (const room of [0,2,4,10]) for (const legacyGrant of [true,false]) {
    const mode = classroomModePolicy(room);
    assert.deepEqual(classroomCapabilities("assistant",mode,legacyGrant),classroomCapabilities("teacher",mode));
  }
});
test("role parity never grants student moderation", () => {
  assert.equal(isClassroomTeachingRole("student"),false);
  assert.equal(classroomCapabilities("student").canEndClass,false);
  assert.equal(classroomCapabilities("student").canControlRecording,false);
  assert.equal(classroomCapabilities("student").canManageMembers,false);
  assert.equal(isClassroomTeachingRole("assistant"),true);
});
test("assistant can share in the main classroom without a separate permission grant", () => {
  assert.equal(canShareClassroomScreen({role:"assistant",assistantManagementAllowed:false,studentSharingSupported:false}),true);
});
