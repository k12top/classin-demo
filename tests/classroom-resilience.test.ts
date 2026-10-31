import assert from "node:assert/strict";
import test from "node:test";
import { classroomConnectionPresence, classroomMemberAway, classroomMemberVisible, classroomPresenceClockOffset } from "../src/lib/classroom/presence";
import { reconcileClassroomRtcPresence } from "../src/lib/classroom/rtc-presence";
import { requestClassroomSession } from "../src/lib/classroom/session-request";
import { requestClassroomHeartbeat, classroomPollDelay } from "../src/lib/classroom/heartbeat-request";
import { coalesceClassroomRead } from "../src/lib/classroom/server/read-coalescing";
import { parseClassroomDiagnostic } from "../src/lib/classroom/connection-diagnostics";
import type { ClassroomMemberSnapshot, ClassroomMediaSnapshot } from "../src/lib/classroom/types";

const now = 1_000_000;
const member: ClassroomMemberSnapshot = { userId: "student", displayName: "Student", avatar: "", role: "student", online: true, onStage: true, stageState: "accepted", screenShareState: "idle", screenShareRequestedAt: null, microphoneAllowed: false, cameraAllowed: false, chatMuted: true, whiteboardWritable: false, handRaisedAt: null, rewardCount: 0, rtcUids: [123] };
const disconnected = { connectionState: "disconnected", participants: [] } as unknown as ClassroomMediaSnapshot;
const response = (status: number, body: unknown, retryAfter?: string) => new Response(JSON.stringify(body), { status, headers: retryAfter ? { "Retry-After": retryAfter } : {} });
const signal = () => new AbortController().signal;

test("missed heartbeats retain a visible seat only through the reconnect deadline", () => {
  const presence = classroomConnectionPresence({ online: false, mayReconnect: true, lastSeenAt: new Date(now - 60_000) }, now);
  assert.equal(presence.connectionStatus, "reconnecting");
  const seat = { ...member, ...presence };
  assert.equal(classroomMemberVisible(seat), true);
  assert.equal(reconcileClassroomRtcPresence([seat], disconnected, now + 59_999)[0].connectionStatus, "reconnecting");
  const expired = reconcileClassroomRtcPresence([seat], disconnected, now + 60_000)[0];
  assert.equal(expired.connectionStatus, "offline");
  assert.equal(classroomMemberVisible(expired), false);
  assert.equal(classroomMemberAway(expired), true);
  assert.equal(classroomMemberAway(seat), false);
  const recovered = { ...expired, ...classroomConnectionPresence({ online: true, mayReconnect: true, lastSeenAt: new Date(now + 61_000) }, now + 61_000) };
  assert.equal(classroomMemberAway(recovered), false);
  assert.equal(classroomMemberVisible(recovered), true);
  assert.equal(expired.onStage, true);
  assert.equal(expired.microphoneAllowed, false);
  assert.equal(expired.whiteboardWritable, false);
});

test("a stale successful snapshot ages to reconnecting even if further state polls fail", () => {
  const seat = { ...member, ...classroomConnectionPresence({ online: true, mayReconnect: true, lastSeenAt: new Date(now) }, now) };
  assert.equal(reconcileClassroomRtcPresence([seat], disconnected, now + 45_001)[0].connectionStatus, "reconnecting");
  assert.equal(reconcileClassroomRtcPresence([seat], disconnected, now + 120_000)[0].connectionStatus, "offline");
});

test("device clock skew cannot immediately expire a fresh server lease", () => {
  const observedAt = new Date(now).toISOString();
  const seat = { ...member, ...classroomConnectionPresence({ online: true, mayReconnect: true, lastSeenAt: new Date(now) }, now) };
  for (const skew of [-300_000, 300_000]) {
    const offset = classroomPresenceClockOffset(observedAt, now + skew);
    assert.equal(reconcileClassroomRtcPresence([seat], disconnected, now + skew - offset)[0].online, true);
    assert.equal(reconcileClassroomRtcPresence([seat], disconnected, now + skew + 60_000 - offset)[0].connectionStatus, "reconnecting");
  }
  assert.equal(classroomPresenceClockOffset("invalid"), 0);
});

test("RTC in either main room or breakout confirms presence without changing grants", () => {
  const media = { connectionState: "connected", participants: [{ id: "123", kind: "camera" }] } as ClassroomMediaSnapshot;
  const seat = { ...member, ...classroomConnectionPresence({ online: false, mayReconnect: true, lastSeenAt: new Date(now - 60_000) }, now) };
  const result = reconcileClassroomRtcPresence([seat], disconnected, now, media)[0];
  assert.equal(result.connectionStatus, "online");
  assert.equal(result.online, true);
  assert.equal(result.microphoneAllowed, false);
  const left = { ...member, rtcUids: [], ...classroomConnectionPresence({ online: false, mayReconnect: false, lastSeenAt: new Date(now) }, now) };
  assert.equal(reconcileClassroomRtcPresence([left], media, now)[0].online, false);
});

test("bootstrap retries temporary errors with the same request identity and bounded backoff", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const result = await requestClassroomSession({ signal: signal(), request: async requestSignal => {
    assert.equal(requestSignal.aborted, false);
    if (++attempts === 1) return response(503, { code: "database_unavailable" }, "2");
    if (attempts === 2) throw new TypeError("network down");
    return response(200, { credential: { token: "fixture" } });
  }, wait: async delay => { delays.push(delay); } });
  assert.deepEqual(result.credential, { token: "fixture" });
  assert.equal(attempts, 3);
  assert.ok(delays.every(delay => delay >= 2_000 && delay < 2_500));
});

test("bootstrap stops after four attempts and malformed success responses cannot enter the room", async () => {
  for (const [status, body] of [[503, {}], [200, null], [200, { credential: "invalid" }]] as const) {
    let attempts = 0;
    await assert.rejects(requestClassroomSession({ signal: signal(), request: async () => { attempts++; return response(status, body); }, wait: async () => {} }));
    assert.equal(attempts, 4);
  }
});

for (const status of [400, 401, 403, 404, 409]) test(`bootstrap ${status} is terminal`, async () => {
  let attempts = 0;
  await assert.rejects(requestClassroomSession({ signal: signal(), request: async () => { attempts++; return response(status, { code: "denied" }); }, wait: async () => assert.fail("must not retry") }));
  assert.equal(attempts, 1);
});

test("bootstrap refreshes expired authentication once and keeps repeated unauthorized responses terminal", async () => {
  let calls = 0, refreshes = 0;
  await assert.rejects(requestClassroomSession({ signal: signal(), request: async () => { calls++; return response(401, {}); }, refreshAuth: async () => { refreshes++; return true; } }));
  assert.equal(calls, 2); assert.equal(refreshes, 1);
});

test("canceling entry during backoff prevents another request", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(requestClassroomSession({ signal: controller.signal, request: async () => { calls++; return response(503, {}); }, wait: async () => { controller.abort(); } }), { name: "AbortError" });
  assert.equal(calls, 1);
});

test("heartbeat never treats a skipped lease as healthy and retries at most once", async () => {
  let calls = 0;
  await assert.rejects(requestClassroomHeartbeat({ signal: signal(), request: async () => { calls++; return response(200, { ok: true, refreshed: false }); }, wait: async () => {} }));
  assert.equal(calls, 2);
  calls = 0;
  assert.equal(await requestClassroomHeartbeat({ signal: signal(), request: async () => ++calls === 1 ? response(503, { refreshed: false }, "2") : response(200, { refreshed: true }), wait: async delay => { assert.ok(delay >= 2_000); } }), true);
});

test("ended or closed connections stop heartbeat retries", async () => {
  let calls = 0;
  assert.equal(await requestClassroomHeartbeat({ signal: signal(), request: async () => { calls++; return response(409, { code: "classroom_ended" }); }, onResponse: (_, payload) => payload.code === "classroom_ended" }), false);
  assert.equal(calls, 1);
  await assert.rejects(requestClassroomHeartbeat({ signal: signal(), request: async () => response(409, { code: "classroom_connection_closed" }), wait: async () => assert.fail("terminal") }));
});

test("polling slows after failures, is bounded and returns to normal after recovery", () => {
  assert.deepEqual([0, 1, 2, 5, 0].map(failures => classroomPollDelay(5_000, failures)), [5_000, 10_000, 20_000, 30_000, 5_000]);
  assert.equal(classroomPollDelay(3_000, 0, true), 30_000);
});

test("simultaneous equivalent reads share work, distinct viewer scopes stay isolated, and results are never cached", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const read = async () => { calls++; await gate; return calls; };
  const first = coalesceClassroomRead("student:lesson", read);
  const duplicate = coalesceClassroomRead("student:lesson", read);
  const staff = coalesceClassroomRead("teacher:lesson", read);
  assert.equal(first, duplicate);
  assert.notEqual(first, staff);
  await Promise.resolve(); assert.equal(calls, 2);
  release(); await Promise.all([first, duplicate, staff]);
  await coalesceClassroomRead("student:lesson", read); assert.equal(calls, 3);
});

test("failed coalesced reads are cleared so later recovery can query again", async () => {
  const fail = () => coalesceClassroomRead("failure:lesson", async () => { throw new Error("database unavailable"); });
  await assert.rejects(fail());
  assert.equal(await coalesceClassroomRead("failure:lesson", async () => "healthy"), "healthy");
});

test("retry diagnostics accept safe counters but strip secrets and unbounded fields", () => {
  const parsed = parseClassroomDiagnostic({ sessionId: "lesson", clientId: "test-client", event: "heartbeat-failed", occurredAt: new Date().toISOString(), durationMs: 10_001.5, failures: 2, lastSuccessAgeMs: 90_000, status: 503, token: "secret", text: "private", delayMs: Infinity });
  assert.equal(parsed?.durationMs, 10_002); assert.equal(parsed?.lastSuccessAgeMs, 90_000);
  for (const key of ["token", "text", "delayMs"]) assert.equal(parsed?.[key], undefined);
});
