import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  agoraWebhookNoticeId,
  verifyAgoraWebhookSignature,
} from "../src/lib/classroom/agora-webhook";

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
