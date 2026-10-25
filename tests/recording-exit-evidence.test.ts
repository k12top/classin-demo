import assert from "node:assert/strict";
import test from "node:test";
import { recordingProviderExited, recordingUploadComplete, recordingVerification } from "../src/lib/classroom/recording-stop-state";
import { loadModule } from "./helpers/load-module";
import * as reconciliation from "../src/lib/classroom/recording-reconciliation";
import type { RecordingProvider } from "../src/lib/classroom/server/types";

test("web recorder exit and finished uploader form explicit terminal evidence", () => {
  const state = { queryVerified: true, serverResponse: { extensionServiceState: [
    { serviceName: "web_recorder_service", payload: { state: "exit" } },
    { serviceName: "upload_service", payload: { uploadingStatus: "uploaded" } },
  ] } };
  assert.equal(recordingProviderExited(state), true);
  assert.equal(recordingProviderExited({ ...state, queryVerified: false }), false);
  assert.equal(recordingProviderExited({ serverResponse: { extensionServiceState: state.serverResponse.extensionServiceState.slice(0, 1) } }), false);
  assert.equal(recordingProviderExited({ serverResponse: { extensionServiceState: state.serverResponse.extensionServiceState.slice(1) } }), false);
});
test("upload backup or unknown status cannot prove finalized cloud storage", () => {
  assert.equal(recordingUploadComplete({ serverResponse: { uploadingStatus: "uploaded" } }), true);
  assert.equal(recordingUploadComplete({ serverResponse: { uploadingStatus: "backuped" } }), false);
  assert.equal(recordingUploadComplete({ serverResponse: { uploadingStatus: "unknown" } }), false);
});
test("operator evidence excludes raw provider payloads and credentials", () => {
  const evidence = recordingVerification({ secret: "do-not-return", started: { token: "private" }, lastQuery: { queryHttpStatus: 404, queryNotFound: true } });
  assert.equal(evidence.queryHttpStatus, 404);
  assert.equal(JSON.stringify(evidence).includes("private"), false);
  assert.equal(JSON.stringify(evidence).includes("do-not-return"), false);
});

function providerFixture(fetch: typeof globalThis.fetch) {
  const errors = loadModule<Record<string, unknown>>("src/lib/classroom/server/errors.ts", { "server-only": {} });
  const adapter = loadModule<{ AgoraCloudRecordingProvider: new () => RecordingProvider }>("src/lib/classroom/providers/agora/server.ts", {
    "server-only": {}, "@/lib/classroom/server/errors": errors,
    "@/lib/classroom/config": { classroomRuntimeDefaults: {} }, "@/lib/classroom/screen-share": {},
    "@/lib/classroom/rtc-uid": {}, "@/lib/classroom/types": {},
    "@/lib/classroom/recording-storage": { validateAgoraRecordingStorageRegion: () => true, expectedAgoraRecordingStorageRegion: () => 10 },
    "@/lib/classroom/recording-reconciliation": reconciliation,
    "@/lib/aliyun-oss": { getAliyunOssClient: () => ({ list: async () => ({ objects: [
      { name: "recordings/lesson/attempt/clip.mp4", size: 100, etag: "v1", lastModified: "2026-10-23T00:00:00Z" },
    ] }) }) },
  }, { fetch, process: { env: {
    AGORA_APP_ID: "app", AGORA_APP_CERTIFICATE: "certificate", AGORA_REST_CUSTOMER_ID: "test-id", AGORA_REST_CUSTOMER_SECRET: "test-secret",
    ALIYUN_OSS_REGION: "oss-ap-southeast-1", ALIYUN_OSS_BUCKET: "bucket", ALIYUN_OSS_ACCESS_KEY_ID: "test-id", ALIYUN_OSS_ACCESS_KEY_SECRET: "test-secret",
    AGORA_RECORDING_STORAGE_REGION: "10", AGORA_RECORDING_MAX_IDLE_SECONDS: "300",
  } } });
  return new adapter.AgoraCloudRecordingProvider();
}
const input = { channelName: "channel", recorderUserId: "1", resourceId: "resource", providerSessionId: "sid",
  providerState: { mode: "web", lastStop: {}, fileNamePrefix: ["recordings", "lesson", "attempt"] } };

test("real provider adapter retains typed authenticated 404 and a stable full asset manifest", async () => {
  const provider = providerFixture(async () => Response.json({ code: 404, reason: "failed to find worker" }, { status: 404 }));
  const first = await provider.query(input);
  const second = await provider.query(input);
  assert.equal(first.providerState.queryNotFound, true);
  assert.equal(first.providerState.queryHttpStatus, 404);
  assert.equal(first.providerState.queryVerified, false);
  assert.equal(first.providerState.storageFingerprint, second.providerState.storageFingerprint);
  assert.equal(first.playbackFormat, "mp4");
});
test("real adapter never treats auth/server errors as missing-task evidence", async () => {
  for (const status of [401, 403, 500]) {
    const provider = providerFixture(async () => Response.json({ code: 404 }, { status }));
    const result = await provider.query(input);
    assert.equal(result.providerState.queryNotFound, false);
    assert.equal(recordingProviderExited(result.providerState), false);
  }
});
test("real stop adapter waits for uploads and preserves synchronous stop evidence", async () => {
  const provider = providerFixture(async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).clientRequest.async_stop, false);
    return Response.json({ sid: "sid", resourceId: "resource", serverResponse: { uploadingStatus: "uploaded" } });
  });
  const result = await provider.stop(input);
  assert.equal(result.providerState.stopSynchronous, true);
  assert.equal(result.providerState.stopVerified, true);
  assert.equal(recordingUploadComplete(result.providerState), true);
});
test("a synchronous timeout business code is not accepted as a successful stop", async () => {
  const provider = providerFixture(async () => Response.json({ code: 50, sid: "sid", resourceId: "resource" }));
  await assert.rejects(provider.stop(input), /code 50/);
});
test("HTTP206 is not synchronous completion and a mismatched query cannot prove exit", async () => {
  const provider = providerFixture(async () => Response.json({ sid: "sid", resourceId: "resource", serverResponse: { uploadingStatus: "uploaded" } }, { status: 206 }));
  assert.equal((await provider.stop(input)).providerState.stopVerified, false);
  const mismatched = providerFixture(async () => Response.json({ sid: "old-sid", serverResponse: { status: 8 } }));
  const result = await mismatched.query(input);
  assert.equal(result.providerState.queryVerified, false);
  assert.equal(recordingProviderExited(result.providerState), false);
});
