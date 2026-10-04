import assert from "node:assert/strict";
import { test } from "node:test";
import { classroomActionRequiresRevision, requestClassroomAction } from "../src/lib/classroom/action-request";
import { formatTimeUntilClass } from "../src/lib/classroom/countdown";
import { canAutoStartRecordingAtStatus, normalizeRecordingStartMode, scheduledClassStartDue } from "../src/lib/classroom/recording-start";
import type { ClassroomAction } from "../src/lib/classroom/types";

const reply = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status });
test("frequent caption revisions do not reject independent mute and interpretation settings", async () => {
  for (const action of [{ type: "muteAllMicrophones" }, { type: "unmuteAllMicrophones" }, { type: "setInterpretation", enabled: true, provider: "shengwang", sourceLanguage: "zh-CN", targetLanguages: ["en-US", "th-TH", "vi-VN", "id-ID"] }] as ClassroomAction[]) {
    let received: Record<string, unknown> = {};
    const { response } = await requestClassroomAction("/actions", { action, clientId: "device-test", expectedRevision: 1 }, async (_, init) => {
      received = JSON.parse(String(init?.body));
      // Server's unrelated caption revision is now 100.
      return "expectedRevision" in received ? reply(409, { error: "stale" }) : reply(200, { runtime: { revision: 101 } });
    });
    assert.equal(response.status, 200);
    assert.equal("expectedRevision" in received, false);
    assert.deepEqual(received.action, action);
  }
});
test("shared layout writes retain revision protection and do not blindly replay a conflict", async () => {
  let requests = 0;
  const action: ClassroomAction = { type: "resetComposition" };
  assert.equal(classroomActionRequiresRevision(action), true);
  const result = await requestClassroomAction("/actions", { action, clientId: "device-test", expectedRevision: 7 }, async (_, init) => {
    requests++;
    assert.equal(JSON.parse(String(init?.body)).expectedRevision, 7);
    return reply(409, { runtime: { revision: 8 } });
  });
  assert.equal(requests, 1);
  assert.equal(result.payload.runtime?.revision, 8);
});
test("temporary database failures retry mute once and then return the confirmed result", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await requestClassroomAction("/actions", { action: { type: "muteAllMicrophones" }, clientId: "device-test" }, async () => ++calls === 1 ? reply(503, { code: "database_unavailable" }) : reply(200, { runtime: { revision: 2 } }), async (ms) => { waits.push(ms); });
  assert.equal(result.response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
});
test("retries are bounded and awards cannot be duplicated by automatic retries", async () => {
  for (const [action, expectedCalls] of [[{ type: "muteAllMicrophones" }, 3], [{ type: "giveReward", targetUserIds: ["student"] }, 1]] as [ClassroomAction, number][]) {
    let calls = 0;
    const result = await requestClassroomAction("/actions", { action, clientId: "device-test" }, async () => { calls++; return reply(503, { code: "database_unavailable" }); }, async () => {});
    assert.equal(calls, expectedCalls);
    assert.equal(result.response.status, 503);
  }
});
test("no recording survives normalization and disables every automatic start", () => {
  assert.equal(normalizeRecordingStartMode("disabled"), "disabled");
  assert.equal(canAutoStartRecordingAtStatus("disabled", "live"), false);
  assert.equal(scheduledClassStartDue("disabled", new Date(0), new Date(2000), new Date(1000)), false);
});
test("long countdown has explicit day hour and minute units in the interface locale", () => {
  assert.match(formatTimeUntilClass((145 * 60 + 36) * 60_000, "zh-CN"), /6天.*1小时.*36分钟/);
  assert.match(formatTimeUntilClass(30 * 60_000, "en"), /30.*min/);
  assert.match(formatTimeUntilClass(20_000, "en"), /1.*min/);
});
