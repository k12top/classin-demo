import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyAgoraWebhookSignature(
  rawBody: string | Uint8Array,
  signature: string,
  secret: string,
) {
  if (!signature.trim() || !secret) return false;
  const normalized = signature.trim().replace(/^sha256=/i, "");
  const digest = createHmac("sha256", secret).update(rawBody).digest();
  return (
    secureEqual(normalized.toLowerCase(), digest.toString("hex")) ||
    secureEqual(normalized, digest.toString("base64"))
  );
}

export function agoraWebhookNoticeId(
  payload: Record<string, unknown>,
  rawBody: string,
) {
  const explicit = payload.noticeId ?? payload.notice_id;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  return createHash("sha256").update(rawBody).digest("hex");
}
