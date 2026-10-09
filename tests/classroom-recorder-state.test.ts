import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

// Exercise the real signed-token access check and route, replacing only the
// database and providers. No production database or recording is touched.
test("recorder content polling is scoped to a signed recording and never renews join credentials", async () => {
  const directory = await mkdtemp(path.join(process.cwd(), "node_modules/.cache-recorder-test-"));
  const previousSecret = process.env.CLASSROOM_RECORDER_SECRET;
  const previousOrigin = process.env.CLASSROOM_PUBLIC_BASE_URL;
  process.env.CLASSROOM_RECORDER_SECRET = "recorder-route-regression-secret";
  process.env.CLASSROOM_PUBLIC_BASE_URL = "https://example.test";
  try {
    const output = path.join(directory, "route.cjs");
    const mocks: Record<string, string> = {
      "server-only": "",
      "@/lib/db": `export const isTransientDatabaseError=()=>false; export const databasePoolSnapshot=()=>null; export const queries=[]; export const prisma={classroomRecording:{findFirst:async query=>{queries.push(query);return query.where.id==='recording-a'&&query.where.sessionId==='lesson-a'&&query.where.mode==='web'?{id:'recording-a',sessionId:'lesson-a',courseId:'course-a',mode:'web',status:'starting',fallbackFrom:null}:null}}};`,
      "@/lib/classroom/server/runtime": `export const reads=[];export async function getClassroomRuntimeSnapshot(...args){reads.push(args);return {revision:reads.length}};export async function getClassroomEngagementSnapshot(){return {activeBuzz:null,selector:null}};export async function getClassroomCourseware(...args){reads.push(args);return []};`,
      "@/lib/classroom/whiteboard/provider-factory": `export const joins=[];export function getWhiteboardProvider(){return {issueJoinCredential:async input=>{joins.push(input);return {enabled:true,provider:'netless',writable:input.writable}}}}`,
      "@/lib/classroom/server/request-access": `export async function resolveClassroomRequestAccess(){throw new Error('Recorder requests must not use cookie-based member access')}`,
    };
    await build({
      stdin: { contents: `export { POST } from './src/app/api/classroom/recorder/state/route'; export { POST as joinWhiteboard } from './src/app/api/classroom/session/whiteboard-credential/route'; export { joins } from '@/lib/classroom/whiteboard/provider-factory'; export { createRecorderPageUrl } from './src/lib/classroom/server/recorder-token'; export { queries } from '@/lib/db'; export { reads } from '@/lib/classroom/server/runtime';`, resolveDir: process.cwd(), loader: "ts" },
      outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: "tsconfig.json",
      plugins: [{ name: "recording-test-dependencies", setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path: name }) => name in mocks ? { path: name, namespace: "mock" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "js" }));
      } }],
    });
    const api = createRequire(import.meta.url)(output);
    const url = new URL(await api.createRecorderPageUrl("lesson-a", "recording-a"));
    const recorderToken = url.searchParams.get("recorderToken");
    const poll = (body: unknown) => api.POST(new Request("https://example.test/api/classroom/recorder/state", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    const valid = { sessionId: "lesson-a", recordingId: "recording-a", recorderToken };
    for (let index = 0; index < 3; index++) {
      const response = await poll(valid);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.recording.mode, "web");
      assert.equal("whiteboard" in payload, false);
      assert.equal("credential" in payload, false);
      assert.match(response.headers.get("Cache-Control"), /no-store/);
    }
    assert.equal(api.joins.length, 0, "content polling must not mint whiteboard credentials");
    assert.deepEqual(api.reads[0], ["course-a", "lesson-a", { ensure: false }]);
    assert.deepEqual(api.reads[1], ["course-a", "teacher", "lesson-a"]);
    for (const body of [null, {}, { ...valid, recorderToken: "invalid" }, { ...valid, sessionId: "lesson-b" }, { ...valid, recordingId: "recording-b" }]) {
      assert.equal((await poll(body)).status, 401);
    }
    assert.equal(api.queries.length, 3, "invalid tokens cannot access the database");
    assert.equal(api.reads.length, 6, "unauthorized requests cannot read classroom content");
    const join = (body: unknown) => api.joinWhiteboard(new Request("https://example.test/api/classroom/session/whiteboard-credential", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    assert.equal((await join(valid)).status, 200);
    assert.deepEqual(api.joins, [{ courseId: "course-a", sessionId: "lesson-a", userId: "recorder-recording-a", role: "student", writable: false }]);
    assert.equal((await join({ ...valid, recordingId: "recording-b" })).status, 401);
    assert.equal(api.joins.length, 1, "cross-recording credentials must be rejected");
  } finally {
    if (previousSecret === undefined) delete process.env.CLASSROOM_RECORDER_SECRET;
    else process.env.CLASSROOM_RECORDER_SECRET = previousSecret;
    if (previousOrigin === undefined) delete process.env.CLASSROOM_PUBLIC_BASE_URL;
    else process.env.CLASSROOM_PUBLIC_BASE_URL = previousOrigin;
    await rm(directory, { recursive: true, force: true });
  }
});
