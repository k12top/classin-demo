import assert from "node:assert/strict";
import test from "node:test";
import { requestClassroomEnd } from "../src/lib/classroom/end-request";
import { recordingOperationFailure } from "../src/lib/classroom/recording-stop-state";
const success = () => Response.json({ session: { status: "afterClass" }, runtime: { status: "ended" } });
test("end waits for an explicit terminal acknowledgment and retries a transient failure", async () => {
  let calls = 0; const body = JSON.stringify({ action: "end", cycleStartedAt: "cycle" }); const bodies: string[] = [];
  const result = await requestClassroomEnd({ signal: new AbortController().signal, request: async signal => {
    assert.equal(signal.aborted, false); bodies.push(body); return ++calls === 1 ? Response.json({ error: "busy" }, { status: 503 }) : success();
  }, wait: async () => {} });
  assert.equal(result.session?.status, "afterClass"); assert.equal(calls, 2); assert.equal(bodies[0], bodies[1]);
});
test("a successful HTTP response cannot falsely confirm a live or malformed end", async () => {
  for (const payload of [{}, { session: { status: "live" } }, { session: { status: "afterClass" }, runtime: { status: "live" } }]) {
    let calls = 0; await assert.rejects(requestClassroomEnd({ signal: new AbortController().signal,
      request: async () => { calls++; return Response.json(payload); }, wait: async () => {} })); assert.equal(calls, 2);
  }
});
test("permission denial or a reopened cycle is terminal and never navigates as success", async () => {
  for (const status of [401, 403, 409]) { let calls = 0; await assert.rejects(requestClassroomEnd({signal:new AbortController().signal,
    request:async()=>{calls++;return Response.json({error:"not accepted"},{status})},wait:async()=>assert.fail("must not retry")}));assert.equal(calls,1); }
});
test("failed recording stops retain sanitized HTTP and business codes through uncertain wrappers", () => {
  const failure = recordingOperationFailure({ causeValue: { name: "ClassroomProviderRequestError", status: 404,
    response: { code: 404, reason: "private", token: "secret" } } });
  assert.deepEqual(failure,{kind:"provider_error",httpStatus:404,code:404}); assert.ok(!JSON.stringify(failure).includes("secret"));
  assert.equal(recordingOperationFailure({name:"TimeoutError"}).kind,"timeout");
  const timeout = new Error("private"); timeout.name = "TimeoutError";
  assert.equal(recordingOperationFailure({causeValue:timeout}).kind,"timeout");
});
