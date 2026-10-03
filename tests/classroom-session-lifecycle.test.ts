import assert from "node:assert/strict";
import { test } from "node:test";
import { classroomMemberPresence, isEndedClassroomResponse } from "../src/lib/classroom/session-lifecycle";
import { stopDisallowedMicrophone } from "../src/lib/classroom/media-permissions";
import { requestClassroomAction } from "../src/lib/classroom/action-request";
import type { ClassroomMediaProvider } from "../src/lib/classroom/types";

test("ended and cancelled lessons stop live work, including legacy error responses", () => {
  for (const status of [403, 409]) {
    for (const code of ["course_finished", "course_cancelled", "classroom_ended"]) {
      assert.equal(isEndedClassroomResponse(status, { code }), true);
    }
    for (const error of ["课次已结束", "课次已取消", "课堂已结束"]) {
      assert.equal(isEndedClassroomResponse(status, { error }), true);
    }
  }
  for (const [status, body] of [[503, { error: "课次已结束" }], [403, { code: "forbidden" }], [409, { code: "stale_revision" }], [200, { code: "course_finished" }], [403, null], [403, "课次已结束"]] as const) {
    assert.equal(isEndedClassroomResponse(status, body), false);
  }
});

test("heartbeat delays and disconnected devices do not revoke accepted stage authorization", () => {
  const now = 100_000;
  const student = { onStage: true, presence: "online", lastSeenAt: new Date(now - 60_000) };
  assert.deepEqual(classroomMemberPresence(student, now, 45_000), { online: false, onStage: true });
  assert.deepEqual(classroomMemberPresence(student, now, 45_000, false), { online: false, onStage: true });
  assert.deepEqual(classroomMemberPresence(student, now, 45_000, true), { online: true, onStage: true });
  assert.deepEqual(classroomMemberPresence({ ...student, presence: "offline", lastSeenAt: new Date(now) }, now, 45_000), { online: false, onStage: true });
  // Presence recovery cannot undo a teacher's explicit removal from the stage.
  assert.deepEqual(classroomMemberPresence({ ...student, onStage: false }, now, 45_000, true), { online: true, onStage: false });
});

function mockMicrophone(toggle: () => Promise<boolean>, isOn: () => boolean) {
  return { toggleMicrophone: toggle, getSnapshot: () => ({ local: { microphoneOn: isOn() } }) } as ClassroomMediaProvider;
}

test("repeated permission snapshots serialize an absolute mute instead of toggling it back on", async () => {
  let on = true;
  let calls = 0;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const provider = mockMicrophone(async () => { calls++; await gate; on = !on; return on; }, () => on);
  const first = stopDisallowedMicrophone(provider);
  const repeated = Array.from({ length: 10 }, () => stopDisallowedMicrophone(provider));
  await Promise.resolve();
  assert.equal(calls, 1);
  finish();
  await Promise.all([first, ...repeated]);
  assert.equal(on, false);
  await stopDisallowedMicrophone(provider);
  assert.equal(calls, 1);
});

test("permission enforcement is isolated per participant and can recover after a device failure", async () => {
  let failingCalls = 0;
  const failure = mockMicrophone(async () => { failingCalls++; if (failingCalls === 1) throw new Error("device unavailable"); return false; }, () => true);
  let otherOn = true;
  const other = mockMicrophone(async () => { otherOn = false; return false; }, () => otherOn);
  await assert.rejects(stopDisallowedMicrophone(failure), /device unavailable/);
  assert.equal(otherOn, true);
  await Promise.all([stopDisallowedMicrophone(failure), stopDisallowedMicrophone(other)]);
  assert.equal(failingCalls, 2);
  assert.equal(otherOn, false);
});

test("ending a lesson during database retry backoff prevents another action request", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(requestClassroomAction("/actions", { action: { type: "muteAllMicrophones" }, clientId: "device" }, async (_, options) => {
    assert.equal(options?.signal, controller.signal);
    calls++;
    return new Response(JSON.stringify({ code: "database_unavailable" }), { status: 503 });
  }, async () => { controller.abort(); }, controller.signal), { name: "AbortError" });
  assert.equal(calls, 1);
});
