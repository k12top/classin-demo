import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  agoraRecordingWebhookLabel,
  agoraWebhookNoticeId,
  classifyAgoraRecordingWebhook,
  verifyAgoraWebhookSignature,
} from "../src/lib/classroom/agora-webhook";
import { appendRecordingProviderState } from "../src/lib/classroom/recording-provider-state";

test("verifies Agora-Signature-V2 against the exact raw body", () => {
  const body = '{"noticeId":"notice-1","payload":{"status":"uploaded"}}';
  const secret = "webhook-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyAgoraWebhookSignature(body, signature, secret), true);
  assert.equal(
    verifyAgoraWebhookSignature(`${body}\n`, signature, secret),
    false,
  );
});

test("uses noticeId for webhook idempotency and hashes legacy payloads", () => {
  assert.equal(
    agoraWebhookNoticeId({ noticeId: "notice-2" }, "ignored"),
    "notice-2",
  );
  assert.equal(
    agoraWebhookNoticeId({}, "same-body"),
    agoraWebhookNoticeId({}, "same-body"),
  );
});

test("classifies official numeric cloud and web recording events", () => {
  assert.equal(classifyAgoraRecordingWebhook({ eventType: 40 }), "started");
  assert.equal(classifyAgoraRecordingWebhook({ eventType: 70 }), "started");
  assert.equal(classifyAgoraRecordingWebhook({ eventType: 31 }), "processing");
  assert.equal(
    classifyAgoraRecordingWebhook({
      eventType: 71,
      payload: { exitStatus: 0 },
    }),
    "processing",
  );
  assert.equal(
    classifyAgoraRecordingWebhook({
      eventType: 71,
      payload: { exitStatus: 2 },
    }),
    "failed",
  );
  assert.equal(classifyAgoraRecordingWebhook({ eventType: 1 }), "failed");
});

test("keeps a readable fallback for legacy textual events", () => {
  const payload = {
    eventType: "legacy",
    payload: { msgName: "web_recorder_stopped", reason: "complete" },
  };
  assert.equal(classifyAgoraRecordingWebhook(payload), "processing");
  assert.match(agoraRecordingWebhookLabel(payload), /web_recorder_stopped/);
});

test("provider callbacks preserve immutable recording context", () => {
  const state = appendRecordingProviderState(
    {
      mode: "web",
      fileNamePrefix: ["recordings", "lesson-1"],
      acquire: { resourceId: "resource-1" },
    },
    "lastWebhook",
    { eventType: 31 },
  );
  assert.equal(state.mode, "web");
  assert.deepEqual(state.fileNamePrefix, ["recordings", "lesson-1"]);
  assert.deepEqual(state.lastWebhook, { eventType: 31 });
});
