import assert from "node:assert/strict";
import test from "node:test";
import { shareClassroomEntryWork } from "../src/lib/classroom/server/entry-work";
import { createClassroomEntryGate } from "../src/lib/classroom/server/entry-gate";

test("entry queue bounds running work, sheds overflow and releases slots after failure", async () => {
  const run = createClassroomEntryGate(1, 1, 1000);
  let unblock!: () => void;
  const hold = new Promise<void>(resolve => { unblock = resolve; });
  let running = 0, maxRunning = 0;
  const operation = async () => { running++; maxRunning = Math.max(maxRunning, running); await hold; running--; };
  const first = run(operation), queued = run(operation);
  await assert.rejects(run(operation), { code: "ENTRY_BUSY" });
  unblock(); await Promise.all([first, queued]);
  assert.equal(maxRunning, 1);
  await assert.rejects(run(async () => { throw new Error("failed"); }), /failed/);
  assert.equal(await run(async () => "recovered"), "recovered");
});

test("expired entry wait never starts database work later", async () => {
  const run = createClassroomEntryGate(1, 1, 20);
  let unblock!: () => void;
  const first = run(() => new Promise<void>(resolve => { unblock = resolve; }));
  await Promise.resolve();
  let started = false;
  await assert.rejects(run(async () => { started = true; }), { code: "ENTRY_BUSY" });
  unblock(); await first;
  assert.equal(started, false);
});

test("duplicate in-flight joins share work, but new joins and other devices remain independent", async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let calls = 0;
  const operation = async () => { calls++; await gate; return Response.json({ credential: { token: "fixture" } }); };
  const first = shareClassroomEntryWork("user:lesson:client-a", operation);
  const retry = shareClassroomEntryWork("user:lesson:client-a", operation);
  const other = shareClassroomEntryWork("user:lesson:client-b", operation);
  finish();
  const responses = await Promise.all([first, retry, other]);
  assert.equal(calls, 2);
  // Route responses must be cloned so one consumer cannot exhaust a peer's body.
  assert.deepEqual(await responses[0].clone().json(), await responses[1].clone().json());
  await shareClassroomEntryWork("user:lesson:client-a", operation);
  assert.equal(calls, 3);
});

test("failed join does not poison subsequent re-entry", async () => {
  await assert.rejects(shareClassroomEntryWork("failed-client", async () => { throw new Error("busy"); }), /busy/);
  assert.equal(await shareClassroomEntryWork("failed-client", async () => "recovered"), "recovered");
});
