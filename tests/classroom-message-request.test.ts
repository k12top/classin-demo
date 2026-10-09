import assert from "node:assert/strict";
import { test } from "node:test";
import { requestClassroomMessage, type ClassroomMessageRequest } from "../src/lib/classroom/message-request";
import { classroomMessageRecordId, isClassroomClientMessageId } from "../src/lib/classroom/server/message-id";

const body: ClassroomMessageRequest = {
  clientMessageId: "2c5f0050-384a-4abd-86af-ab6210176b59", content: "能说话了吗？", scope: "classroom",
};
const reply = (status: number, payload: unknown, headers?: HeadersInit) => new Response(JSON.stringify(payload), { status, headers });
const success = () => reply(201, { message: { id: "confirmed" }, revision: 0 });

test("temporary database failures retry the identical request and respect bounded Retry-After", async () => {
  const requests: string[] = [], waits: number[] = [];
  const result = await requestClassroomMessage("/messages", body, async (_, init) => {
    requests.push(String(init?.body));
    return requests.length === 1 ? reply(503, { code: "database_unavailable" }, { "Retry-After": "20" }) : success();
  }, async ms => { waits.push(ms); });
  assert.equal(result.response.status, 201);
  assert.deepEqual(requests, [JSON.stringify(body), JSON.stringify(body)]);
  assert.deepEqual(waits, [2000]);
});

test("a lost network reply and invalid gateway response recover with the same message key", async () => {
  let calls = 0;
  const result = await requestClassroomMessage("/messages", body, async (_, init) => {
    assert.equal(JSON.parse(String(init?.body)).clientMessageId, body.clientMessageId);
    if (++calls === 1) throw new TypeError("Failed to fetch after commit");
    if (calls === 2) return new Response("<html>Gateway</html>");
    return success();
  }, async () => {});
  assert.equal(calls, 3); assert.equal(result.payload.message?.id, "confirmed");
});

test("authorization, content and idempotency conflicts are returned without retries", async () => {
  for (const status of [400, 401, 403, 404, 409]) {
    let calls = 0;
    const result = await requestClassroomMessage("/messages", body, async () => {
      calls++; return reply(status, { error: "policy denial" });
    }, async () => assert.fail("policy errors must not wait"));
    assert.equal(calls, 1); assert.equal(result.response.status, status);
  }
});

test("three failed attempts stop and keep retry identity available to the caller", async () => {
  for (const networkFailure of [false, true]) {
    let calls = 0;
    const request = requestClassroomMessage("/messages", body, async () => {
      calls++;
      if (networkFailure) throw Error("network unavailable");
      return reply(500, { error: "unavailable" });
    }, async () => {});
    if (networkFailure) await assert.rejects(request, /network unavailable/);
    else assert.equal((await request).response.status, 500);
    assert.equal(calls, 3); assert.equal(body.clientMessageId, "2c5f0050-384a-4abd-86af-ab6210176b59");
  }
});

test("leaving during retry backoff cancels the next send", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(requestClassroomMessage("/messages", body, async () => {
    calls++; return reply(503, {});
  }, async () => { controller.abort(); }, controller.signal), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("server retry identity is scoped to sender and session with canonical UUID validation", () => {
  const id = classroomMessageRecordId("session", "student", body.clientMessageId);
  assert.equal(classroomMessageRecordId("session", "student", body.clientMessageId.toUpperCase()), id);
  assert.notEqual(classroomMessageRecordId("other-session", "student", body.clientMessageId), id);
  assert.notEqual(classroomMessageRecordId("session", "other-student", body.clientMessageId), id);
  for (const value of [null, undefined, 123, "", "retry", `${body.clientMessageId}x`]) assert.equal(isClassroomClientMessageId(value), false);
  assert.equal(isClassroomClientMessageId(body.clientMessageId), true);
});
