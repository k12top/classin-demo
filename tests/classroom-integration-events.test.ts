import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { createClassroomEventEmitter, normalizeParentOrigin, type ClassroomIntegrationEvent } from "../src/lib/classroom/integration-events";
import { sendClassroomWebhook, webhookRetryAt, classroomWebhookConfig } from "../src/lib/classroom/webhook-delivery";
import { classroomEmbedOrigins, classroomCookiePolicy, isAllowedClassroomMutation } from "../src/lib/classroom/embed-policy";

const snapshot = { courseId: "course", sessionId: "lesson", courseStatus: "live", classroomStatus: "live", startedAt: "2026-10-03T01:00:00Z", occurredAt: "2026-10-03T01:00:00Z", reason: "state_sync", actor: { userId: "teacher", role: "teacher" } };

test("iframe allowlist only accepts exact origins and cross-site cookies require Secure", () => {
  assert.deepEqual(classroomEmbedOrigins("https://rc.example, https://rc.example, http://localhost:3000"), ["https://rc.example", "http://localhost:3000"]);
  assert.deepEqual(classroomEmbedOrigins(""), []);
  for (const value of ["*", "null", "https://rc.example/path", "https://rc.example?x=1", "https://user:password@rc.example"]) assert.throws(() => classroomEmbedOrigins(value));
  assert.deepEqual(classroomCookiePolicy("none", false), { sameSite: "none", secure: true });
  assert.deepEqual(classroomCookiePolicy("lax", false), { sameSite: "lax", secure: false });
});

test("iframe cookie configuration rejects cookie-authenticated cross-origin writes", () => {
  const request = { method: "POST", hasSessionCookie: true, origin: "https://classroom.example", requestOrigin: "https://classroom.example", fetchSite: "same-origin" };
  assert.equal(isAllowedClassroomMutation(request, true), true);
  assert.equal(isAllowedClassroomMutation({ ...request, origin: "https://rc.example" }, true), false);
  assert.equal(isAllowedClassroomMutation({ ...request, origin: "null" }, true), false);
  assert.equal(isAllowedClassroomMutation({ ...request, origin: null, fetchSite: "cross-site" }, true), false);
  assert.equal(isAllowedClassroomMutation({ ...request, origin: "https://rc.example", hasSessionCookie: false }, true), true);
  assert.equal(isAllowedClassroomMutation({ ...request, origin: "https://rc.example", method: "GET" }, true), true);
});

test("only real classroom states emit start/end; polls and repeated leave clicks are deduplicated", () => {
  const events: ClassroomIntegrationEvent[] = [];
  const emitter = createClassroomEventEmitter((event) => events.push(event));
  emitter.observe({ ...snapshot, classroomStatus: "waiting" });
  assert.equal(events.length, 0);
  for (let i = 0; i < 4; i++) emitter.observe(snapshot);
  assert.equal(events.length, 1);
  emitter.leave({ ...snapshot, reason: "user_leave" });
  emitter.leave({ ...snapshot, reason: "pagehide" });
  emitter.observe({ ...snapshot, classroomStatus: "ended" });
  assert.deepEqual(events.map((event) => [event.type, event.ended]), [["classroom.started", false], ["classroom.user_left", false]]);
});

test("teacher closes before navigation; initial ended state never fabricates a start", () => {
  const events: ClassroomIntegrationEvent[] = [];
  const emitter = createClassroomEventEmitter((event) => events.push(event));
  const ended = { ...snapshot, classroomStatus: "ended", courseStatus: "afterClass" };
  emitter.observe(ended);
  emitter.observe(ended);
  emitter.leave({ ...ended, reason: "pagehide" });
  assert.deepEqual(events.map((event) => [event.type, event.ended]), [["classroom.ended", true], ["classroom.user_left", true]]);
});

test("a host subscription replays the exact event ID; reopening has a new lifecycle", () => {
  const events: ClassroomIntegrationEvent[] = [];
  const emitter = createClassroomEventEmitter((event) => events.push(event));
  emitter.observe(snapshot);
  emitter.replay();
  assert.equal(events[0].eventId, events[1].eventId);
  emitter.observe({ ...snapshot, classroomStatus: "ended" });
  emitter.observe({ ...snapshot, startedAt: "2026-10-03T02:00:00Z" });
  assert.equal(events.length, 4);
  assert.notEqual(events[0].eventId, events[3].eventId);
});

test("parent origins are concrete HTTP origins, never wildcard, null or script URLs", () => {
  assert.equal(normalizeParentOrigin("https://rc.example/course?id=1"), "https://rc.example");
  for (const origin of [undefined, "*", "null", "javascript:alert(1)", "file:///tmp", "https://user:password@rc.example"]) assert.equal(normalizeParentOrigin(origin), undefined);
});

test("webhooks sign the exact transmitted bytes with event ID, timestamp and optional auth", async () => {
  let event!: ClassroomIntegrationEvent;
  createClassroomEventEmitter((value) => { event = value; }).observe(snapshot);
  const transport: typeof fetch = async (url, options) => {
    assert.equal(url, "https://rc.example/events");
    assert.equal(options?.redirect, "error");
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("authorization"), "Bearer private-token");
    assert.equal(headers.get("x-classroom-event-id"), event.eventId);
    const body = options?.body as string;
    const expected = createHmac("sha256", "signing-secret").update(`${headers.get("x-classroom-timestamp")}.${body}`).digest("hex");
    assert.equal(headers.get("x-classroom-signature"), `sha256=${expected}`);
    assert.deepEqual(JSON.parse(body), event);
    return new Response(null, { status: 204 });
  };
  await sendClassroomWebhook(event, { url: "https://rc.example/events", secret: "signing-secret", token: "private-token" }, transport);
});

test("non-2xx delivery and network errors are retryable, with bounded backoff", async () => {
  let event!: ClassroomIntegrationEvent;
  createClassroomEventEmitter((value) => { event = value; }).observe(snapshot);
  const config = { url: "https://rc.example/events", secret: "secret" };
  await assert.rejects(sendClassroomWebhook(event, config, async () => new Response("private RC diagnostics", { status: 503 })), /^Error: Webhook HTTP 503$/);
  await assert.rejects(sendClassroomWebhook(event, config, async () => { throw new Error("network down"); }), /network down/);
  assert.equal(webhookRetryAt(1, 0).getTime(), 30_000);
  assert.equal(webhookRetryAt(2, 0).getTime(), 60_000);
  assert.equal(webhookRetryAt(100, 0).getTime(), 3_600_000);
});

test("webhooks require both configuration values and HTTPS except loopback development", () => {
  const previous = { url: process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL, secret: process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET };
  try {
    delete process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL;
    delete process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET;
    assert.equal(classroomWebhookConfig(), null);
    process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL = "http://rc.example/events";
    assert.equal(classroomWebhookConfig(), null);
    process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET = "secret";
    assert.throws(classroomWebhookConfig, /HTTPS/);
    process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL = "http://127.0.0.1:12345/events";
    assert.equal(classroomWebhookConfig()?.url, "http://127.0.0.1:12345/events");
  } finally {
    if (previous.url === undefined) delete process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL; else process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL = previous.url;
    if (previous.secret === undefined) delete process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET; else process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET = previous.secret;
  }
});
