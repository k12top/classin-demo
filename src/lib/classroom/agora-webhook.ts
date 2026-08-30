import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type AgoraRecordingWebhookDisposition =
  | "started"
  | "processing"
  | "failed"
  | "unchanged";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function agoraWebhookDeepValue(
  value: unknown,
  names: readonly string[],
): unknown {
  const queue: unknown[] = [value];
  for (let index = 0; index < queue.length && index < 100; index += 1) {
    const current = queue[index];
    const record = recordValue(current);
    if (!record) {
      if (Array.isArray(current)) queue.push(...current);
      continue;
    }
    for (const name of names) {
      if (record[name] !== undefined && record[name] !== null) {
        return record[name];
      }
    }
    queue.push(...Object.values(record));
  }
  return undefined;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function agoraRecordingWebhookLabel(payload: unknown): string {
  return [
    agoraWebhookDeepValue(payload, ["eventType", "event_type", "type"]),
    agoraWebhookDeepValue(payload, ["msgName", "messageName", "eventName"]),
    agoraWebhookDeepValue(payload, ["status", "state", "reason", "message"]),
  ]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Classify the numeric NCS events used by cloud and web recording. */
export function classifyAgoraRecordingWebhook(
  payload: unknown,
): AgoraRecordingWebhookDisposition {
  const eventType = numericValue(
    agoraWebhookDeepValue(payload, ["eventType", "event_type", "type"]),
  );
  const exitStatus = numericValue(
    agoraWebhookDeepValue(payload, [
      "exitStatus",
      "exit_status",
      "errorCode",
      "error_code",
    ]),
  );

  // 1: cloud recording service error.
  if (eventType === 1) return "failed";
  // 40/70: cloud recorder / web recorder has started.
  if (eventType === 40 || eventType === 70) return "started";
  // 11/41/71: service leaves or recorder stops. A non-zero exit status is
  // abnormal; a normal exit waits for the upload-complete event/file list.
  if (eventType === 11 || eventType === 41 || eventType === 71) {
    return exitStatus !== null && exitStatus !== 0 ? "failed" : "processing";
  }
  // 31: uploaded files are ready to be resolved by the route.
  if (eventType === 31) return "processing";

  const label = agoraRecordingWebhookLabel(payload);
  if (/fail|error|abnormal/.test(label)) return "failed";
  if (/start|running/.test(label)) return "started";
  if (/stop|leave|upload|complete|finish/.test(label)) return "processing";
  return "unchanged";
}

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
