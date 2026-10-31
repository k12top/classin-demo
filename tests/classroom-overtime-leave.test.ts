import test from "node:test";
import assert from "node:assert/strict";
import { isClassroomOvertime, teacherConnectionBlocksEnd } from "../src/lib/classroom/overtime-leave";
import { CLASSROOM_RECONNECT_WINDOW_MS } from "../src/lib/classroom/presence";

const now = new Date("2026-10-31T02:00:00Z");
const startedAt = new Date(now.getTime() - 3600_000);
test("overtime begins at lesson end and excludes the hard deadline or missing deadline", () => {
  assert(isClassroomOvertime(now, new Date(+now + 1), now));
  assert(!isClassroomOvertime(new Date(+now + 1), new Date(+now + 60_000), now));
  assert(!isClassroomOvertime(new Date(+now - 1), now, now));
  assert(!isClassroomOvertime(new Date(+now - 1), null, now));
});
test("only an explicit finish departure releases a recent teacher connection immediately", () => {
  for (const leaveIntent of [null, "disconnected", "temporary"]) {
    assert(teacherConnectionBlocksEnd({ lastSeenAt: now, leftAt: now, leaveIntent }, startedAt, now));
  }
  assert(!teacherConnectionBlocksEnd({ lastSeenAt: now, leftAt: now, leaveIntent: "finishIfLastTeacher" }, startedAt, now));
});
test("temporary leave reserves a teacher's seat beyond reconnect grace, but old cycles and replaced devices do not", () => {
  const connection = { lastSeenAt: new Date(+now - 600_000), leftAt: new Date(+now - 500_000), leaveIntent: "temporary" };
  assert(teacherConnectionBlocksEnd(connection, startedAt, now));
  assert(!teacherConnectionBlocksEnd(connection, now, now));
  assert(!teacherConnectionBlocksEnd({ ...connection, replacedAt: now }, startedAt, now));
});
test("refresh/disconnect holds the full reconnect window after departure, even with an older heartbeat", () => {
  const connection = { lastSeenAt: new Date(+now - 300_000), leftAt: now, leaveIntent: "disconnected" };
  assert(teacherConnectionBlocksEnd(connection, startedAt, new Date(+now + CLASSROOM_RECONNECT_WINDOW_MS - 1)));
  assert(!teacherConnectionBlocksEnd(connection, startedAt, new Date(+now + CLASSROOM_RECONNECT_WINDOW_MS)));
});
test("an active second device blocks end independently of a finished first device", () => {
  const connections = [
    { lastSeenAt: now, leftAt: now, leaveIntent: "finishIfLastTeacher" },
    { lastSeenAt: now, leftAt: null, leaveIntent: null },
  ];
  assert(connections.some(connection => teacherConnectionBlocksEnd(connection, startedAt, now)));
});
test("a stale PostgreSQL heartbeat never declares an unclosed teacher absent when Redis owns presence", () => {
  assert(teacherConnectionBlocksEnd({ lastSeenAt: new Date(+now - 600_000), leftAt: null }, startedAt, now));
  assert(teacherConnectionBlocksEnd({ lastSeenAt: new Date(+startedAt - 600_000), leftAt: null }, startedAt, now));
  assert(teacherConnectionBlocksEnd({ lastSeenAt: new Date(+startedAt - 600_000), leftAt: now, leaveIntent: "temporary" }, startedAt, now));
});
