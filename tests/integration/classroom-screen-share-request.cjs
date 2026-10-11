/* eslint-disable @typescript-eslint/no-require-imports -- Disposable PostgreSQL tests the real invitation API. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const { Pool } = require("pg");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/classroom_recovery_"), "requires a disposable loopback database");

async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-screen-share-request.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "server-only": "",
    "next/server": "export const after=()=>{};export const NextResponse=Response;",
    "@/lib/classroom/server/request-access": "export const resolveClassroomRequestAccess=async()=>globalThis.invitationActor.allowed===false?{ok:false,status:401,error:'Unauthorized'}:{ok:true,session:{userId:globalThis.invitationActor.userId},access:globalThis.invitationActor};",
    "@/lib/classroom/server/runtime": "export class ClassroomActionError extends Error{constructor(message,status){super(message);this.status=status}};export class ClassroomRevisionConflictError extends Error{};export const applyClassroomAction=async()=>{globalThis.invitationHeavyCalls=(globalThis.invitationHeavyCalls||0)+1;return {revision:999};};export const getClassroomRuntimeSnapshot=async()=>{throw new Error('Invitation queried the full roster')};export const getClassroomEngagementSnapshot=async()=>{globalThis.invitationHeavyCalls=(globalThis.invitationHeavyCalls||0)+1;return {};};",
    "@/lib/classroom/server/integration-events": "export const deliverClassroomEvents=async()=>{};",
    "@/lib/classroom/server/transcription-orchestrator": "export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};",
    "@/lib/classroom/server/recording-orchestrator": "export const requestRecordingStop=async()=>{};export const processRecordingStop=async()=>{};",
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from '@/lib/db';export {POST} from '@/app/api/courses/[id]/classroom/actions/route';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-services", setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      const source = args.path === "./runtime" && /\/server\/(screen-share-request|member-permissions)\.ts$/.test(args.importer) ? "@/lib/classroom/server/runtime" : args.path;
      if (source in stubs) return { path: source, namespace: "fixture" };
    });
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const { prisma: db, POST } = require(output);
  const course = await db.course.create({ data: { name: "Invitation speed", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Invitation speed", createdBy: "teacher", startTime: new Date(), endTime: new Date(Date.now() + 3600000) } });
  const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live" } });
  for (const [userId, role] of [["teacher", "teacher"], ["assistant", "assistant"], ["student", "student"]]) {
    await db.classroomMemberState.create({ data: { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, userId, role, displayName: userId, microphoneAllowed: false, cameraAllowed: false, onStage: false, stageState: "offstage", presence: "online" } });
  }
  const teacher = { courseId: course.id, sessionId: lesson.id, userId: "teacher", role: "teacher" };
  globalThis.invitationActor = teacher;
  const request = (targetUserId = "student", compactScreenShareRequest = true) => POST(new Request("http://localhost/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: { type: "requestScreenShare", targetUserId }, clientId: "teacher-client", expectedRevision: -1, compactScreenShareRequest }) }), { params: Promise.resolve({ id: lesson.id }) });
  const student = () => db.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId: lesson.id, userId: "student" } } });
  const before = await student();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let lock;
  try {
    lock = await pool.connect(); await lock.query("BEGIN");
    await lock.query('LOCK TABLE "ClassroomRewardEvent" IN ACCESS EXCLUSIVE MODE');
    const response = await request();
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload), ["screenShareRequest"]);
    assert.equal(payload.screenShareRequest.courseId, lesson.id);
    assert.equal(payload.screenShareRequest.actorId, "teacher");
    assert.equal(payload.screenShareRequest.targetUserId, "student");
    const invited = await student();
    assert.equal(invited.screenShareState, "requested");
    assert.equal(invited.screenShareRequestedAt.toISOString(), payload.screenShareRequest.requestedAt);
    for (const key of ["onStage", "stageState", "microphoneAllowed", "cameraAllowed", "whiteboardWritable", "chatMuted"]) assert.equal(invited[key], before[key]);
    assert.equal(globalThis.invitationHeavyCalls, undefined);
    console.log("PASS invitation commits without roster, reward or engagement reads and grants no capture permission");

    for (const [userId, role] of [["student", "student"], ["assistant", "assistant"]]) {
      globalThis.invitationActor = { ...teacher, userId, role };
      assert.equal((await request()).status, 403);
    }
    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { assistantPermissions: { assistant: true } } });
    assert.equal((await request()).status, 200);
    globalThis.invitationActor = { ...teacher, allowed: false };
    assert.equal((await request()).status, 401);
    globalThis.invitationActor = teacher;
    assert.equal((await request("teacher")).status, 409);
    assert.equal((await request("missing")).status, 409);
    assert.equal((await request(42)).status, 400);
    console.log("PASS invitation authorization and target validation preserve the original safeguards");

    const revision = (await db.classroomRuntime.findUnique({ where: { id: runtime.id } })).revision;
    const concurrent = await Promise.all([request(), request(), request()]);
    const updates = await Promise.all(concurrent.map(async item => { assert.equal(item.status, 200); return (await item.json()).screenShareRequest; }));
    assert.deepEqual(updates.map(item => item.revision).sort((a, b) => a - b), [revision + 1, revision + 2, revision + 3]);
    assert.equal((await student()).screenShareRequestedAt.toISOString(), updates.sort((a, b) => b.revision - a.revision)[0].requestedAt);
    console.log("PASS simultaneous invitations commit ordered revisions despite an unrelated stale UI revision");

    const legacy = await request("student", false);
    assert.equal(legacy.status, 200);
    assert.deepEqual(Object.keys(await legacy.json()).sort(), ["engagement", "runtime"]);
    assert.equal(globalThis.invitationHeavyCalls, 2);
    await db.courseSession.update({ where: { id: lesson.id }, data: { roomType: 10 } });
    assert.equal((await request()).status, 409);
    await db.courseSession.update({ where: { id: lesson.id }, data: { roomType: 4 } });
    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "ended" } });
    assert.equal((await request()).status, 409);
    console.log("PASS legacy clients, unsupported classroom modes and ended-session behavior remain intact");
  } finally {
    if (lock) { await lock.query("ROLLBACK"); lock.release(); }
    await pool.end(); await db.course.delete({ where: { id: course.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
