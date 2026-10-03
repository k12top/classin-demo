import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePublicCourse, parsePublicSession, publicIdempotencyKey, publicPage, readPublicJson, PublicApiError } from "../src/lib/public-api/input";

function status(expected: number) {
  return (error: unknown) => error instanceof PublicApiError && error.status === expected;
}

test("anonymous course creation records explicit ownership without accepting permission or status fields", () => {
  const input = parsePublicCourse({ name: "  English  ", ownerId: "org/teacher", ownerName: "Teacher", roomType: 4 }, true);
  assert.equal(input.name, "English");
  assert.equal(input.ownerId, "org/teacher");
  for (const body of [null, [], { name: "English" }, { name: 123, ownerId: "teacher" }, { name: "English", ownerId: "teacher", roomType: 3 }, { name: "English", ownerId: "teacher", publicApiManaged: true }, { name: "English", ownerId: "teacher", status: "live" }]) assert.throws(() => parsePublicCourse(body, true), status(400));
  assert.throws(() => parsePublicCourse({ ownerId: "other" }, false), status(400));
  assert.throws(() => parsePublicCourse({}, false), status(400));
});

test("session dates require a timezone, a real calendar date and a positive interval", () => {
  const input = parsePublicSession({ startTime: "2026-11-03T09:00:00+08:00", endTime: "2026-11-03T10:00:00+08:00" }, true);
  assert.equal(input.startTime?.toISOString(), "2026-11-03T01:00:00.000Z");
  for (const startTime of ["2026-11-03T09:00:00", "2026-02-30T09:00:00Z", "2026-11-03T24:00:00Z", "bad", null]) assert.throws(() => parsePublicSession({ startTime, endTime: "2026-11-03T10:00:00Z" }, true), status(400));
  assert.throws(() => parsePublicSession({ startTime: "2026-11-03T11:00:00Z", endTime: "2026-11-03T10:00:00Z" }, true), status(400));
  assert.throws(() => parsePublicSession({ title: "" }, false), status(400));
  assert.throws(() => parsePublicSession({ status: "live" }, false), status(400));
});

test("lesson rosters support explicit empty lists and bound unique student identities", () => {
  assert.deepEqual(parsePublicSession({ students: [] }, false), { students: [] });
  assert.deepEqual(parsePublicSession({ students: [{ userId: "student" }] }, false).students, [{ userId: "student", displayName: "student" }]);
  assert.throws(() => parsePublicSession({ students: [null] }, false), status(400));
  assert.throws(() => parsePublicSession({ students: [{ userId: "s" }, { userId: "s" }] }, false), status(400));
  assert.throws(() => parsePublicSession({ students: Array.from({ length: 101 }, (_, i) => ({ userId: String(i) })) }, false), status(400));
});

test("pagination and retry keys are bounded rather than silently truncated", () => {
  assert.deepEqual(publicPage(new URLSearchParams()), { limit: 20, after: undefined, ownerId: undefined });
  for (const limit of ["0", "101", "Infinity", "1.5"]) assert.throws(() => publicPage(new URLSearchParams({ limit })), status(400));
  assert.equal(publicIdempotencyKey(new Headers()), undefined);
  assert.equal(publicIdempotencyKey(new Headers({ "Idempotency-Key": "rc-123" })), "rc-123");
  assert.throws(() => publicIdempotencyKey(new Headers({ "Idempotency-Key": "a".repeat(161) })), status(400));
});

test("JSON request errors are explicit, and streamed oversized bodies are stopped", async () => {
  const request = (body: string, headers = { "Content-Type": "application/json" }) => new Request("https://example.com", { method: "POST", headers, body });
  assert.deepEqual(await readPublicJson(request('{"name":"English"}')), { name: "English" });
  await assert.rejects(readPublicJson(request("bad")), status(400));
  await assert.rejects(readPublicJson(request("{}", { "Content-Type": "text/plain" })), status(415));
  await assert.rejects(readPublicJson(request(JSON.stringify({ name: "a".repeat(65_536) }))), status(413));
});
