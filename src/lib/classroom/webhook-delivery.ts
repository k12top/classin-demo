import { createHmac } from "node:crypto";
import type { ClassroomIntegrationEvent } from "./integration-events";

export type ClassroomWebhookConfig = { url: string; secret: string; token?: string };

export function classroomWebhookConfig(): ClassroomWebhookConfig | null {
  const url = process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL?.trim();
  const secret = process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) throw new Error("Classroom webhook requires HTTPS (loopback HTTP is allowed for testing)");
  if (parsed.username || parsed.password) throw new Error("Use the webhook token setting for authentication");
  return { url: parsed.toString(), secret, token: process.env.CLASSROOM_LIFECYCLE_WEBHOOK_TOKEN?.trim() };
}

export async function sendClassroomWebhook(event: ClassroomIntegrationEvent, config: NonNullable<ReturnType<typeof classroomWebhookConfig>>, transport: typeof fetch = fetch) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", config.secret).update(`${timestamp}.${body}`).digest("hex");
  const response = await transport(config.url, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(5_000),
    headers: {
      "Content-Type": "application/json", "X-Classroom-Event-Id": event.eventId,
      "X-Classroom-Timestamp": timestamp, "X-Classroom-Signature": `sha256=${signature}`,
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    }, body,
  });
  // Do not log remote response bodies, which may contain credentials or PII.
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
}

export function webhookRetryAt(attempt: number, now = Date.now()) {
  return new Date(now + Math.min(3_600, 30 * 2 ** Math.min(attempt - 1, 7)) * 1_000);
}
