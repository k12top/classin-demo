import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

test("activity stage API binds recorder access to its signed recording and excludes manager detail", async () => {
  const directory = await mkdtemp(path.join(process.cwd(), "node_modules/.cache-activity-route-"));
  const oldSecret = process.env.CLASSROOM_RECORDER_SECRET;
  const oldOrigin = process.env.CLASSROOM_PUBLIC_BASE_URL;
  process.env.CLASSROOM_RECORDER_SECRET = "local-activity-route-test-only";
  process.env.CLASSROOM_PUBLIC_BASE_URL = "https://example.test";
  try {
    const output = path.join(directory, "route.cjs");
    const mocks: Record<string, string> = {
      "server-only": "",
      "@/lib/db": `export const prisma={classroomRecording:{findFirst:async q=>q.where.id==='recording-a'&&q.where.sessionId==='lesson-a'&&q.where.mode==='web'?{id:'recording-a',sessionId:'lesson-a',courseId:'course-a'}:null}};`,
      "@/lib/classroom/server/activities": `export const calls=[];export async function activityPresentation(id){calls.push(id);return {id:'activity-a',title:'Quiz',status:'active',question:{prompt:'Question',options:[]},statistics:null}};`,
      "@/lib/classroom/server/request-access": `export async function resolveClassroomRequestAccess(){return {ok:false,status:401,error:'Unauthorized'}};`,
    };
    await build({ stdin: { contents: `export {GET} from './src/app/api/sessions/[sessionId]/classroom/activities/presentation/route';export {createRecorderPageUrl} from './src/lib/classroom/server/recorder-token';export {calls} from '@/lib/classroom/server/activities';`, resolveDir: process.cwd(), loader: "ts" }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: "tsconfig.json", plugins: [{ name: "isolated-activity-route", setup(b) {
      b.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "fixture" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "ts" }));
    } }] });
    const load = createRequire(import.meta.url);
    const route = load(output);
    const { NextRequest } = load("next/server");
    const signed = new URL(await route.createRecorderPageUrl("lesson-a", "recording-a"));
    const token = signed.searchParams.get("recorderToken")!;
    const invoke = (id: string, recording: string | null, recorder: string | null) => route.GET(new NextRequest("https://example.test/api/presentation", { headers: {
      ...(recording ? { "X-Classroom-Recording": recording } : {}), ...(recorder ? { "X-Classroom-Recorder": recorder } : {}),
    } }), { params: Promise.resolve({ sessionId: id }) });
    const valid = await invoke("lesson-a", "recording-a", token);
    assert.equal(valid.status, 200); assert.ok(valid.headers.get("cache-control").includes("no-store"));
    const data = await valid.json(); assert.equal(data.presentation.title, "Quiz"); assert.equal("responses" in data.presentation, false);
    for (const response of [await invoke("lesson-a", "recording-b", token), await invoke("lesson-b", "recording-a", token), await invoke("lesson-a", null, token), await invoke("lesson-a", "recording-a", token + "invalid"), await invoke("lesson-a", null, null)]) assert.equal(response.status, 401);
    assert.deepEqual(route.calls, ["lesson-a"]);
  } finally {
    if (oldSecret === undefined) delete process.env.CLASSROOM_RECORDER_SECRET; else process.env.CLASSROOM_RECORDER_SECRET = oldSecret;
    if (oldOrigin === undefined) delete process.env.CLASSROOM_PUBLIC_BASE_URL; else process.env.CLASSROOM_PUBLIC_BASE_URL = oldOrigin;
    await rm(directory, { recursive: true, force: true });
  }
});
