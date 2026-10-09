/* eslint-disable @typescript-eslint/no-require-imports -- Disposable PostgreSQL exercises the actual moderation API. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const { Pool } = require("pg");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/classroom_recovery_"), "requires a disposable loopback database");

async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-member-permissions.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "server-only": "",
    "next/server": "export const after=()=>{};export const NextResponse=Response;",
    "@/lib/classroom/server/request-access": "export const resolveClassroomRequestAccess=async()=>globalThis.permissionActor.allowed===false?{ok:false,status:401,error:'Unauthorized'}:{ok:true,session:{userId:globalThis.permissionActor.userId},access:globalThis.permissionActor};",
    "@/lib/classroom/server/runtime": "export class ClassroomActionError extends Error{constructor(message,status){super(message);this.status=status}};export class ClassroomRevisionConflictError extends Error{};export const applyClassroomAction=async()=>{globalThis.permissionHeavyCalls=(globalThis.permissionHeavyCalls||0)+1;return {revision:999};};export const getClassroomRuntimeSnapshot=async()=>{throw new Error('Moderation queried the full roster')};export const getClassroomEngagementSnapshot=async()=>{globalThis.permissionHeavyCalls=(globalThis.permissionHeavyCalls||0)+1;return {};};",
    "@/lib/classroom/server/integration-events": "export const deliverClassroomEvents=async()=>{};",
    "@/lib/classroom/server/transcription-orchestrator": "export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};",
    "@/lib/classroom/server/recording-orchestrator": "export const requestRecordingStop=async()=>{};export const processRecordingStop=async()=>{};",
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from '@/lib/db';export {POST} from '@/app/api/courses/[id]/classroom/actions/route';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-services", setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      const source = args.path === "./runtime" && args.importer.endsWith("/server/member-permissions.ts") ? "@/lib/classroom/server/runtime" : args.path;
      if (source in stubs) return { path: source, namespace: "fixture" };
    });
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const { prisma: db, POST } = require(output);
  const course = await db.course.create({ data: { name: "Moderation speed", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Moderation speed", createdBy: "teacher", startTime: new Date(), endTime: new Date(Date.now() + 3600000) } });
  const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live" } });
  for (const [userId, role] of [["teacher", "teacher"], ["assistant", "assistant"], ["student", "student"], ["self-muted", "student"]]) {
    await db.classroomMemberState.create({ data: { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, userId, role, displayName: userId, avatar: "profile.png", microphoneAllowed: true, cameraAllowed: true, onStage: true, stageState: "accepted", presence: "online" } });
  }
  globalThis.permissionActor = { courseId: course.id, sessionId: lesson.id, userId: "teacher", role: "teacher" };
  const request = (action, expectedRevision = 1, compactMemberPermissions = true) => POST(new Request("http://localhost/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, clientId: "test-client", expectedRevision, compactMemberPermissions }) }), { params: Promise.resolve({ id: lesson.id }) });
  const member = userId => db.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId: lesson.id, userId } } });
  const before = await member("student"), samples = [];
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let lock;
  try {
    lock = await pool.connect(); await lock.query("BEGIN");
    await lock.query('LOCK TABLE "ClassroomRewardEvent" IN ACCESS EXCLUSIVE MODE');
    for (const type of ["muteAllMicrophones", "unmuteAllMicrophones"]) {
      const started = performance.now(), response = await request({ type }); samples.push(Math.round(performance.now() - started));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ["memberPermissions"]);
      assert.equal(body.memberPermissions.microphoneAllowed, type === "unmuteAllMicrophones");
      assert.equal(body.memberPermissions.courseId, lesson.id);
      assert.equal((await member("student")).microphoneAllowed, type === "unmuteAllMicrophones");
      assert.equal((await member("teacher")).microphoneAllowed, true);
      assert.equal((await member("assistant")).microphoneAllowed, true);
      assert.ok(samples.at(-1) < 1000, "moderation must not wait on the blocked reward snapshot");
    }
    await lock.query("ROLLBACK"); lock.release(); lock = null;
    const after = await member("student");
    for (const key of ["avatar", "displayName", "lastSeenAt", "joinedAt", "onStage", "stageState", "cameraAllowed", "chatMuted", "whiteboardWritable", "presence"]) assert.deepEqual(after[key], before[key], key);
    console.log("PASS compact mute/restore response bypasses blocked rewards, full roster and engagement; local durations", samples.join(", "), "ms");

    assert.equal((await request({ type: "setMediaAllowed", targetUserId: "student", microphoneAllowed: false, cameraAllowed: false })).status, 200);
    assert.equal((await member("student")).cameraAllowed, false);
    assert.equal((await member("self-muted")).cameraAllowed, true);
    assert.equal((await request({ type: "setMediaAllowed", targetUserId: "missing", microphoneAllowed: false, cameraAllowed: false })).status, 404);
    assert.equal((await request({ type: "setMediaAllowed", targetUserId: "student", microphoneAllowed: "false", cameraAllowed: true })).status, 400);
    console.log("PASS single-member moderation changes only its target and rejects missing or malformed targets");

    for (const [userId, role] of [["student", "student"], ["assistant", "assistant"]]) {
      globalThis.permissionActor.userId = userId; globalThis.permissionActor.role = role;
      assert.equal((await request({ type: "unmuteAllMicrophones" })).status, 403);
    }
    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { assistantPermissions: { assistant: true } } });
    assert.equal((await request({ type: "unmuteAllMicrophones" })).status, 200);
    globalThis.permissionActor.allowed = false;
    assert.equal((await request({ type: "muteAllMicrophones" })).status, 401);
    globalThis.permissionActor = { courseId: course.id, sessionId: lesson.id, userId: "teacher", role: "teacher" };
    console.log("PASS authenticated teacher or explicitly authorized assistant required for every moderation request");

    const revision = (await db.classroomRuntime.findUnique({ where: { id: runtime.id } })).revision;
    const concurrent = await Promise.all([request({ type: "muteAllMicrophones" }), request({ type: "unmuteAllMicrophones" }), request({ type: "muteAllMicrophones" })]);
    const updates = await Promise.all(concurrent.map(async response => { assert.equal(response.status, 200); return (await response.json()).memberPermissions; }));
    assert.deepEqual(updates.map(p => p.revision).sort((a, b) => a - b), [revision + 1, revision + 2, revision + 3]);
    assert.equal((await member("student")).microphoneAllowed, updates.sort((a, b) => b.revision - a.revision)[0].microphoneAllowed);
    console.log("PASS concurrent absolute commands commit distinct ordered revisions despite stale UI revision");

    assert.equal(globalThis.permissionHeavyCalls, undefined, "compact requests never use heavy action or engagement reads");
    const legacy = await request({ type: "muteAllMicrophones" }, 1, false);
    assert.equal(legacy.status, 200);
    assert.deepEqual(Object.keys(await legacy.json()).sort(), ["engagement", "runtime"]);
    assert.equal(globalThis.permissionHeavyCalls, 2);
    console.log("PASS older clients retain the full runtime and engagement response until refreshed");

    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "ended" } });
    const ended = await request({ type: "unmuteAllMicrophones" });
    assert.equal(ended.status, 409); assert.equal((await ended.json()).error, "课堂已结束");
    console.log("PASS ended classrooms reject moderation without changing permissions");
  } finally {
    if (lock) { await lock.query("ROLLBACK"); lock.release(); }
    await pool.end(); await db.course.delete({ where: { id: course.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
