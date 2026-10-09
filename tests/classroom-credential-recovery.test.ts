import assert from "node:assert/strict";
import test from "node:test";
import { ClassroomRecoveryError, retryClassroomRecovery } from "../src/lib/classroom/credential-recovery";
import { renewAgoraConnection } from "../src/lib/classroom/agora-credential-recovery";
import { parseClassroomDiagnostic } from "../src/lib/classroom/connection-diagnostics";

const credential = { appId: "app", channelName: "lesson", token: "fresh", rtcUid: 123 };
function client(state: string) {
  const calls: unknown[][] = [];
  return { calls, connectionState: state,
    async join(...args: unknown[]) { calls.push(["join", ...args]); },
    async renewToken(token: string) { calls.push(["renew", token]); },
    async publish(tracks: string[]) { calls.push(["publish", ...tracks]); },
    async leave() { calls.push(["leave"]); },
  };
}
test("connected media renews in place without dropping tracks", async () => {
  const rtc = client("CONNECTED");
  await renewAgoraConnection(rtc, credential, ["camera", "microphone"], () => true);
  assert.deepEqual(rtc.calls, [["renew", "fresh"]]);
});
test("expired media rejoins with the fresh token and republishes existing tracks", async () => {
  const rtc = client("DISCONNECTED");
  await renewAgoraConnection(rtc, credential, ["camera", "microphone"], () => true);
  assert.deepEqual(rtc.calls, [["join", "app", "lesson", "fresh", 123], ["publish", "camera", "microphone"]]);
});
test("expiry event before a disconnected state still forces a fresh join", async () => {
  const rtc = client("CONNECTED");
  await renewAgoraConnection(rtc, credential, ["camera"], () => true, true);
  assert.deepEqual(rtc.calls, [["leave"], ["join", "app", "lesson", "fresh", 123], ["publish", "camera"]]);
});
test("leaving during join closes the stale client without publishing", async () => {
  let active = true;
  const rtc = client("DISCONNECTED");
  rtc.join = async () => { active = false; };
  await assert.rejects(renewAgoraConnection(rtc, credential, ["camera"], () => active), { name: "AbortError" });
  assert.deepEqual(rtc.calls, [["leave"]]);
});
test("leaving during republish cannot complete recovery", async () => {
  let active = true;
  const rtc = client("DISCONNECTED");
  rtc.publish = async () => { active = false; };
  await assert.rejects(renewAgoraConnection(rtc, credential, ["camera"], () => active), { name: "AbortError" });
  assert.equal(rtc.calls.at(-1)?.[0], "leave");
});
test("temporary database and network errors retry, respecting server delay", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const result = await retryClassroomRecovery(async () => {
    attempts++;
    if (attempts === 1) throw new ClassroomRecoveryError(503, 2_000);
    if (attempts === 2) throw new TypeError("Failed to fetch");
    return "recovered";
  }, { signal: new AbortController().signal, wait: async (delay) => { delays.push(delay); } });
  assert.equal(result, "recovered");
  assert.deepEqual(delays, [2_000, 2_000]);
});
test("malformed server delay cannot cause a zero-delay retry loop", async () => {
  let attempts = 0;
  const delays: number[] = [];
  await retryClassroomRecovery(async () => {
    if (++attempts < 3) throw new ClassroomRecoveryError(503, NaN);
  }, { signal: new AbortController().signal, wait: async (delay) => { delays.push(delay); } });
  assert.deepEqual(delays, [1_000, 2_000]);
});
for (const status of [400, 401, 403, 404, 409]) test(`terminal ${status} does not loop`, async () => {
  let attempts = 0;
  await assert.rejects(retryClassroomRecovery(async () => {
    attempts++; throw new ClassroomRecoveryError(status);
  }, { signal: new AbortController().signal, wait: async () => { assert.fail("must not wait"); } }));
  assert.equal(attempts, 1);
});
test("leaving cancels the retry wait immediately", async () => {
  const controller = new AbortController();
  const recovering = retryClassroomRecovery(async () => { throw new ClassroomRecoveryError(503); }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(recovering, { name: "AbortError" });
});
test("a late response after leaving cannot be treated as recovered", async () => {
  const controller = new AbortController();
  await assert.rejects(retryClassroomRecovery(async () => { controller.abort(); return "late"; }, { signal: controller.signal }), { name: "AbortError" });
});
test("diagnostics strip credentials, captions, URLs and arbitrary error text", () => {
  const parsed = parseClassroomDiagnostic({ sessionId: "lesson", clientId: "test-client", event: "connection-state",
    state: "disconnected", previousState: "connected", reason: "TOKEN_EXPIRE", occurredAt: new Date().toISOString(),
    token: "secret", recorderToken: "secret", error: "Authorization bearer secret", caption: "private", url: "private", online: true,
  });
  assert.equal(parsed?.reason, "TOKEN_EXPIRE");
  for (const key of ["token", "recorderToken", "error", "caption", "url"]) assert.equal(parsed?.[key], undefined);
  assert.equal(parseClassroomDiagnostic({ sessionId: "lesson", clientId: "short", event: "connection-state", occurredAt: "invalid" }), null);
});
