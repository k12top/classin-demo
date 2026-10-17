import assert from "node:assert/strict";
import test from "node:test";
import { watchCourseSessionSummary, type SummaryStatusPayload } from "../src/lib/course-session-summary-watch";

const completed = { summary: { sessionId: "lesson", updatedAt: "2026-10-17T04:00:00Z", generatedBy: "system", isStale: false }, canManage: true, generation: { status: "completed" as const, requestId: "task", error: null } };
const queued = { summary: null, generation: { status: "queued" as const, requestId: "task", error: null }, canManage: true };

test("an ended lesson queues itself and displays the completed result without a manual click", async () => {
  const requests: string[] = [], states: SummaryStatusPayload[] = [];
  const responses = [{ summary: null, canManage: true, generation: null }, queued, { ...queued, generation: { ...queued.generation, status: "running" } }, completed];
  await watchCourseSessionSummary({ sessionId: "lesson", ended: true, signal: new AbortController().signal, intervalMs: 1,
    onStatus: state => states.push(state), onUnavailable: () => assert.fail("No read should fail"),
    fetchImpl: async (url, init) => { requests.push(`${init?.method || "GET"} ${url}`); return Response.json(responses.shift()); },
  });
  assert.equal(requests.filter(request => request.startsWith("POST")).length, 1);
  assert.ok(requests.filter(request => request.startsWith("GET")).every(request => request.endsWith("?summaryOnly=1")));
  assert.deepEqual(states.map(state => state.generation?.status), ["queued", "running", "completed"]);
  assert.deepEqual(states.at(-1)?.summary, completed.summary);
});

test("a transient status failure does not report a successful generation as failed", async () => {
  let reads = 0, errors = 0;
  const states: SummaryStatusPayload[] = [];
  await watchCourseSessionSummary({ sessionId: "lesson", ended: true, signal: new AbortController().signal, intervalMs: 1,
    onStatus: state => states.push(state), onUnavailable: () => { errors++; },
    fetchImpl: async () => { if (++reads === 1) throw new Error("Connection reset after generation"); return Response.json(completed); },
  });
  assert.equal(errors, 0); assert.equal(states.at(-1)?.generation?.status, "completed");
});

test("a lost queue response recovers the persisted task instead of requesting duplicate work", async () => {
  let posts = 0, gets = 0;
  const states: SummaryStatusPayload[] = [];
  await watchCourseSessionSummary({ sessionId: "lesson", ended: true, signal: new AbortController().signal, intervalMs: 1,
    onStatus: state => states.push(state), onUnavailable: () => assert.fail("The next status read recovers"),
    fetchImpl: async (_url, init) => {
      if (init?.method === "POST") { posts++; throw new Error("Response lost after enqueue"); }
      gets++; return Response.json(gets === 1 ? { summary: null, canManage: true } : gets === 2 ? queued : completed);
    },
  });
  assert.equal(posts, 1); assert.deepEqual(states.at(-1)?.summary, completed.summary);
});

test("switching lessons aborts late results, and published results do not trigger regeneration", async () => {
  const controller = new AbortController();
  await watchCourseSessionSummary({ sessionId: "lesson", ended: true, signal: controller.signal, intervalMs: 1,
    onStatus: () => assert.fail("Aborted result must not update another lesson"), onUnavailable: () => assert.fail(),
    fetchImpl: async () => { controller.abort(); return Response.json(completed); },
  });
  let calls = 0;
  await watchCourseSessionSummary({ sessionId: "lesson", ended: true, signal: new AbortController().signal, intervalMs: 1,
    onStatus: state => assert.deepEqual(state.summary, completed.summary), onUnavailable: () => assert.fail(),
    fetchImpl: async (_url, init) => { calls++; assert.notEqual(init?.method, "POST"); return Response.json(completed); },
  });
  assert.equal(calls, 1);
});
