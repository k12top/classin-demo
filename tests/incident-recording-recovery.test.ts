import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import * as reconciliation from "../src/lib/classroom/recording-reconciliation";
import { classroomParticipantOwnerId } from "../src/lib/classroom/local-participant";
import { reconcileConfiguredEnvironments, reconciliationTargets } from "../src/lib/classroom/reconciliation-targets";
import { loadModule } from "./helpers/load-module";

function aliasStubs(path: string) {
  return Object.fromEntries([...readFileSync(path, "utf8").matchAll(/from "(@\/[^"\n]+)"/g)].map((match) => [match[1], {}]));
}

test("finished lessons queue and stop a recording instead of restarting it", async () => {
  const path = "src/lib/classroom/server/recording-orchestrator.ts";
  const row = { id: "attempt", status: "recording", session: { status: "finished" }, recorderUserId: "recorder", resourceId: "resource", providerSessionId: "sid", stopRequestedAt: null, providerState: {} };
  let stopped = 0;
  const service = loadModule<{ reconcileRecordingAttempt(id: string): Promise<typeof row> }>(path, {
    ...aliasStubs(path), "server-only": {},
    "@/lib/course-status": { CourseStatus: { FINISHED: "finished", AFTER_CLASS: "afterClass", CANCELLED: "cancelled" } },
    "@/lib/classroom/server/errors": {},
    "@/lib/classroom/recording-provider-state": { appendRecordingProviderState: (state: object, key: string, value: unknown) => ({ ...state, [key]: value }) },
    "@/lib/classroom/server/provider-factory": { getRecordingProvider: () => ({ stop: async () => { stopped++; return { playbackObjectKey: "recordings/attempt/clip.mp4", playbackFormat: "mp4", files: [], providerState: {} }; } }) },
    "@/lib/db": { prisma: { classroomRecording: {
      findUnique: async () => ({ ...row }), findUniqueOrThrow: async () => ({ ...row }),
      updateMany: async ({ data }: { data: object }) => { Object.assign(row, data); return { count: 1 }; },
    } } },
  });
  assert.equal((await service.reconcileRecordingAttempt("attempt")).status, "completed");
  assert.equal(stopped, 1);
  assert.ok(row.stopRequestedAt);
});

test("ordinary classroom polls do not acquire a write transaction", async () => {
  const path = "src/lib/classroom/server/runtime.ts";
  const graceEndsAt = new Date(Date.now() + 60_000);
  const existing = { id: "runtime", status: "live", graceEndsAt };
  let transactions = 0;
  const runtime = loadModule<{ ensureClassroomRuntime(courseId: string, sessionId: string): Promise<unknown> }>(path, {
    ...aliasStubs(path), "server-only": {}, "./integration-events": {},
    "@/lib/course-status": { CourseStatus: { FINISHED: "finished", CANCELLED: "cancelled", SCHEDULED: "scheduled", LIVE: "live" } },
    "@/lib/classroom/policy": { classroomGraceEndAt: () => graceEndsAt },
    "@/lib/db": { prisma: {
      courseSession: { findFirst: async () => ({ id: "lesson", status: "live", endTime: new Date() }) },
      classroomRuntime: { findUnique: async () => existing },
      $transaction: async () => { transactions++; assert.fail("Unchanged poll should be read-only"); },
    } },
  });
  assert.equal(await runtime.ensureClassroomRuntime("course", "lesson"), existing);
  assert.equal(transactions, 0);
});

test("expired Agora resource with no stop marker recovers existing OSS files", async () => {
  const types = loadModule<Record<string, unknown>>("src/lib/classroom/server/errors.ts", { "server-only": {} });
  let listed = false;
  const provider = loadModule<{ AgoraCloudRecordingProvider: new () => { query(input: unknown): Promise<{ playbackObjectKey: string; active: boolean }> } }>("src/lib/classroom/providers/agora/server.ts", {
    "server-only": {},
    "@/lib/classroom/server/errors": types,
    "@/lib/classroom/config": { classroomRuntimeDefaults: {} },
    "@/lib/classroom/screen-share": {},
    "@/lib/classroom/rtc-uid": {},
    "@/lib/classroom/types": {},
    "@/lib/classroom/recording-storage": { validateAgoraRecordingStorageRegion: () => true, expectedAgoraRecordingStorageRegion: () => 10 },
    "@/lib/classroom/recording-reconciliation": reconciliation,
    "@/lib/aliyun-oss": { getAliyunOssClient: () => ({ list: async () => { listed = true; return { objects: [{ name: "recordings/lesson/attempt/clip_0.mp4", size: 100 }] }; } }) },
  }, {
    fetch: async () => new Response(JSON.stringify({ code: 2, reason: "resourceid exceeded time limit!" }), { status: 400 }),
    process: { env: {
      AGORA_APP_ID: "app", AGORA_APP_CERTIFICATE: "certificate", AGORA_REST_CUSTOMER_ID: "id", AGORA_REST_CUSTOMER_SECRET: "secret",
      ALIYUN_OSS_REGION: "oss-ap-southeast-1", ALIYUN_OSS_BUCKET: "bucket",
      ALIYUN_OSS_ACCESS_KEY_ID: "id", ALIYUN_OSS_ACCESS_KEY_SECRET: "secret",
      AGORA_RECORDING_STORAGE_REGION: "10", AGORA_RECORDING_MAX_IDLE_SECONDS: "300",
    } },
  });
  const result = await new provider.AgoraCloudRecordingProvider().query({
    resourceId: "expired", providerSessionId: "sid", providerState: { mode: "web", fileNamePrefix: ["recordings", "lesson", "attempt"] },
  });
  assert.equal(listed, true);
  assert.equal(result.active, false);
  assert.equal(result.playbackObjectKey, "recordings/lesson/attempt/clip_0.mp4");
});

test("active recorder does not promote a partial segment to completed", () => {
  assert.equal(reconciliation.shouldRecoverRecordingFromStorage({ active: true, postStop: false, providerExpired: false, hasPlayback: false }), false);
  assert.equal(reconciliation.recordingResourceExpired({ code: 2, reason: "invalid parameter" }), false);
});

test("all nonterminal recording states receive playback refresh and reconciliation", () => {
  assert.equal(reconciliation.recordingNeedsReconciliation("recording"), true);
  assert.equal(reconciliation.recordingNeedsReconciliation("starting"), true);
  assert.equal(reconciliation.recordingNeedsReconciliation("completed"), false);
});

test("expired member heartbeats cannot erase local RTC ownership", () => {
  const members = [{ userId: "teacher", rtcUids: [] }];
  assert.equal(classroomParticipantOwnerId({ id: "123456789", isLocal: true }, members, "teacher"), "teacher");
  assert.equal(classroomParticipantOwnerId({ id: "123456789", isLocal: false }, members, "teacher"), "123456789");
});

test("custom environment reconciliation forwards credentials without redirects", async () => {
  const raw = JSON.stringify([{ origin: "https://live.bytecome.com", secret: "test-secret" }]);
  let seen = false;
  const result = await reconcileConfiguredEnvironments(raw, (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://live.bytecome.com/api/cron/promote-course-status");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer test-secret");
    assert.equal((init.headers as Record<string, string>)["x-classroom-reconciliation-forwarded"], "1");
    assert.equal(init.redirect, "error"); seen = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch);
  assert.equal(seen, true);
  assert.deepEqual(result, [{ origin: "https://live.bytecome.com", ok: true }]);
  assert.throws(() => reconciliationTargets('[{"origin":"http://local","secret":"secret"}]'));
  assert.throws(() => reconciliationTargets('[{"origin":"https://example.com/path","secret":"secret"}]'));
});

test("MP4 playback does not request the content-type override rejected by OSS", async () => {
  const path = "src/app/api/sessions/[sessionId]/recordings/[recordingId]/play/route.ts";
  const objectKey = "recordings/lesson/attempt/clip.mp4";
  let signed = false;
  const handler = loadModule<{ GET(request: unknown, context: unknown): Promise<Response> }>(path, {
    ...aliasStubs(path),
    "next/server": { NextResponse: { redirect: (url: string) => new Response(null, { status: 307, headers: { Location: url } }), json: (body: unknown, init: ResponseInit) => Response.json(body, init) } },
    "@/lib/session": { getSessionFromRequest: async () => ({ userId: "owner" }) },
    "@/lib/courseware-access": { resolveCoursewareAccess: async () => ({ allowed: true }) },
    "@/lib/db": { prisma: { classroomRecording: { findFirst: async () => ({ courseId: "course", playbackObjectKey: objectKey, playbackFormat: "mp4", files: [], providerState: {} }) } } },
    "@/lib/classroom/recording-playback": { recordingPlaybackAssets: () => [{ objectKey, format: "mp4" }] },
    "@/lib/aliyun-oss": { getCoursewareOssClient: () => ({ signatureUrl: (key: string, options: { response: Record<string, string> }) => {
      assert.equal(key, objectKey);
      assert.equal(options.response["content-type"], undefined);
      assert.equal(options.response["content-disposition"], "inline");
      signed = true; return "https://example.com/clip.mp4";
    } }) },
  });
  const response = await handler.GET({ nextUrl: new URL("https://example.com/play") }, { params: Promise.resolve({ sessionId: "lesson", recordingId: "attempt" }) });
  assert.equal(response.status, 307);
  assert.equal(signed, true);
});
