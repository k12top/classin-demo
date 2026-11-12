import assert from "node:assert/strict";
import test from "node:test";
import { classroomChatSpace } from "../src/lib/classroom/chat-space";
import type { ClassroomSpaceSnapshot } from "../src/lib/classroom/types";

const room = (id: string, isAssigned: boolean, status: ClassroomSpaceSnapshot["status"] = "open"): ClassroomSpaceSnapshot => ({ id, isAssigned, status, kind: "breakout", name: id, position: 0, capacity: null, memberCount: 0, assistantCount: 0, members: [] });

test("chat switches immediately when a student's room assignment changes", () => {
  assert.equal(classroomChatSpace([room("old", false), room("new", true)], "old", "student"), "new");
  assert.equal(classroomChatSpace([room("old", false)], "old", "student"), null);
  assert.equal(classroomChatSpace([room("old", true, "closed")], "old", "student"), null);
});

test("teacher can monitor another open room and closed or missing rooms are excluded", () => {
  assert.equal(classroomChatSpace([room("one", false), room("two", true)], "one", "teacher"), "one");
  assert.equal(classroomChatSpace([room("one", false, "closed"), room("two", true)], "one", "teacher"), "two");
  assert.equal(classroomChatSpace([], "missing", "teacher"), null);
});

test("observers and unknown roles cannot inherit a stale room", () => {
  assert.equal(classroomChatSpace([room("one", true)], "one", "observer"), null);
  assert.equal(classroomChatSpace([room("one", true)], "one", undefined), null);
});
