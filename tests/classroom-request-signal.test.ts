import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import { withClassroomRequestSignal } from "../src/lib/classroom/request-signal";
import { requestClassroomSession } from "../src/lib/classroom/session-request";
import { requestClassroomHeartbeat } from "../src/lib/classroom/heartbeat-request";

test("recorder bootstrap and heartbeats work without AbortSignal.any or timeout", async () => {
  const any = Object.getOwnPropertyDescriptor(AbortSignal, "any")!;
  const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout")!;
  Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
  Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
  try {
    const controller = new AbortController();
    let requests = 0;
    const session = await requestClassroomSession({ signal: controller.signal, request: async signal => {
      assert.equal(signal.aborted, false); requests++;
      return Response.json({ credential: { token: "synthetic" } });
    } });
    assert.ok(session.credential);
    assert.equal(await requestClassroomHeartbeat({ signal: controller.signal, request: async () => {
      requests++; return Response.json({ refreshed: true });
    } }), true);
    assert.equal(requests, 2);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  } finally {
    Object.defineProperty(AbortSignal, "any", any);
    Object.defineProperty(AbortSignal, "timeout", timeout);
  }
});

test("request deadlines and classroom departure still abort and remove listeners", async () => {
  const waitForAbort = (signal: AbortSignal) => new Promise<void>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  await assert.rejects(withClassroomRequestSignal(10, undefined, waitForAbort), { name: "TimeoutError" });
  const parent = new AbortController();
  const request = withClassroomRequestSignal(1000, parent.signal, waitForAbort);
  parent.abort(new DOMException("Classroom left", "AbortError"));
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  let called = false;
  await assert.rejects(withClassroomRequestSignal(1000, parent.signal, async () => { called = true; }), { name: "AbortError" });
  assert.equal(called, false);
});
