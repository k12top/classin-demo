// Run against a disposable loopback PostgreSQL database named classroom_recovery_*.
/* eslint-disable @typescript-eslint/no-require-imports -- Node harness loads its generated CommonJS bundle. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const { Pool } = require("pg");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.startsWith("/classroom_recovery_")) {
  throw new Error("Connection acceptance requires a disposable loopback classroom_recovery_* database");
}

async function run() {
  const output = path.join(root, "node_modules/.cache/classroom-connection-acceptance.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const mocks = {
    "server-only": "",
    "@/lib/classroom/server/integration-events": "export const enqueueClassroomEvent=async()=>{}; export const deliverClassroomEvents=async()=>{};",
    "@/lib/classroom/server/request-access": `export async function resolveClassroomRequestAccess(){const a=globalThis.connectionActor;return a.allowed===false?{ok:false,status:401,error:'Unauthorized'}:{ok:true,session:{userId:a.userId},access:{sessionId:a.sessionId,courseId:a.courseId,role:a.role}}}`,
    "@/lib/session": "export const getSessionFromRequest=async()=>globalThis.connectionActor.allowed===false?null:{userId:globalThis.connectionActor.userId};",
    "@/lib/classroom/server/recorder-token": "export const verifyRecorderToken=async()=>false;",
    "@/lib/classroom/signaling/agora-server": "export const issueAgoraSignalingCredential=()=>null;",
    "@/lib/classroom/server/provider-factory": "export const getClassroomServerProvider=()=>({issueCredential:input=>({...input,token:'fixture-fresh',rtcUid:123,expiresInSeconds:21600})});",
    "@/lib/classroom/server/runtime": "export class ClassroomActionError extends Error{};export class ClassroomRevisionConflictError extends Error{};export const applyClassroomAction=async()=>{throw new Error('Heartbeat ran the heavy action path')};export const getClassroomRuntimeSnapshot=async()=>{throw new Error('Heartbeat fetched full snapshot')};export const getClassroomEngagementSnapshot=async()=>{throw new Error('Heartbeat fetched engagement')};",
    "@/lib/classroom/server/transcription-orchestrator": "export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};",
    "@/lib/classroom/server/recording-orchestrator": "export const requestRecordingStop=async()=>{};export const processRecordingStop=async()=>{};",
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from './src/lib/db';export * from './src/lib/classroom/server/connections';export {POST as renew} from './src/app/api/classroom/session/renew-credential/route';export {POST as heartbeat} from './src/app/api/courses/[id]/classroom/actions/route';export {POST as diagnostic} from './src/app/api/classroom/connection-diagnostics/route';`, resolveDir: root },
    outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-services", setup(build) {
      build.onResolve({ filter: /^(server-only|@\/lib\/classroom\/server\/(integration-events|request-access|recorder-token|provider-factory|runtime|transcription-orchestrator|recording-orchestrator)|@\/lib\/classroom\/signaling\/agora-server|@\/lib\/session)$/ }, args => ({ path: args.path, namespace: "mock" }));
      build.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  const api = require(output);
  const db = api.prisma;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const course = await db.course.create({ data: { name: "Connection acceptance", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Connection acceptance", createdBy: "teacher", status: "live", startTime: new Date(), endTime: new Date(Date.now() + 3_600_000) } });
  const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live" } });
  const userId = "student"; const clientId = "acceptance-client";
  const member = await db.classroomMemberState.create({ data: { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, userId, displayName: "Student", role: "student", presence: "online", onStage: false, whiteboardWritable: false } });
  globalThis.connectionActor = { sessionId: lesson.id, courseId: course.id, userId, role: "student", allowed: true };
  const id = `${lesson.id}:${userId}:${clientId}`;
  const request = body => new Request("http://localhost/api/classroom", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(body) });
  const results = [];
  async function check(name, operation) { await operation(); results.push(name); console.log("PASS", name); }
  let lock;
  try {
    await api.touchClassroomConnection(lesson.id, userId, clientId, true);
    const old = new Date(Date.now() - 90_000);
    await db.classroomConnection.update({ where: { id }, data: { lastSeenAt: old } });
    lock = await pool.connect();
    await lock.query("BEGIN");
    await lock.query('SELECT "id" FROM "ClassroomMemberState" WHERE "id"=$1 FOR UPDATE', [member.id]);
    await check("busy heartbeat skips the member lock promptly", async () => {
      const started = Date.now();
      await api.touchClassroomConnection(lesson.id, userId, clientId);
      assert.ok(Date.now() - started < 800);
      assert.ok((await db.classroomConnection.findUnique({ where: { id } })).lastSeenAt > old, "connection lease refreshes while the member remains locked");
    });
    await check("join lock waits are bounded and return a temporary failure", async () => {
      const started = Date.now();
      await assert.rejects(api.touchClassroomConnection(lesson.id, userId, clientId, true), /lock timeout/);
      assert.ok(Date.now() - started < 2_000);
    });
    await check("renewal stays read-only while a member write lock is held", async () => {
      const response = await api.renew(request({ sessionId: lesson.id, clientId }));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.credential.token, "fixture-fresh");
      assert.equal(body.credential.publisher, false);
    });
    await lock.query("ROLLBACK"); lock.release(); lock = null;
    await check("heartbeat refreshes the lease without changing stage grants", async () => {
      await api.touchClassroomConnection(lesson.id, userId, clientId);
      const lease = await db.classroomConnection.findUnique({ where: { id } });
      const current = await db.classroomMemberState.findUnique({ where: { id: member.id } });
      assert.ok(lease.lastSeenAt > old); assert.equal(current.onStage, false); assert.equal(current.whiteboardWritable, false);
    });
    await check("left tabs are not resurrected by heartbeat", async () => {
      await db.classroomConnection.update({ where: { id }, data: { leftAt: new Date(), lastSeenAt: old } });
      await api.touchClassroomConnection(lesson.id, userId, clientId);
      const lease = await db.classroomConnection.findUnique({ where: { id } });
      assert.ok(lease.leftAt); assert.equal(lease.lastSeenAt.getTime(), old.getTime());
      await api.touchClassroomConnection(lesson.id, userId, clientId, true);
      assert.equal((await db.classroomConnection.findUnique({ where: { id } })).leftAt, null);
    });
    await check("presence-only endpoint avoids snapshots and action writes", async () => {
      const response = await api.heartbeat(request({ clientId, presenceOnly: true, action: { type: "heartbeat" } }), { params: Promise.resolve({ id: lesson.id }) });
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, status: "live" });
    });
    await check("accepted student renewal preserves publishing authorization", async () => {
      await db.classroomMemberState.update({ where: { id: member.id }, data: { onStage: true, stageState: "accepted", cameraAllowed: false } });
      const body = await (await api.renew(request({ sessionId: lesson.id, clientId }))).json();
      assert.equal(body.credential.publisher, true);
    });
    await check("ended lessons reject renewal and presence", async () => {
      await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "ended" } });
      assert.equal((await api.renew(request({ sessionId: lesson.id, clientId }))).status, 409);
      const response = await api.heartbeat(request({ clientId, presenceOnly: true, action: { type: "heartbeat" } }), { params: Promise.resolve({ id: lesson.id }) });
      assert.equal(response.status, 409); assert.equal((await response.json()).code, "classroom_ended");
    });
    await check("unauthorized renewal cannot mint credentials", async () => {
      globalThis.connectionActor.allowed = false;
      assert.equal((await api.renew(request({ sessionId: lesson.id, clientId }))).status, 401);
      globalThis.connectionActor.allowed = true;
    });
    await check("diagnostic logs contain no supplied tokens or captions", async () => {
      const records = []; const log = console.info;
      console.info = (...args) => records.push(args);
      try {
        const response = await api.diagnostic(request({ sessionId: lesson.id, clientId, event: "connection-state", state: "disconnected", reason: "TOKEN_EXPIRE", occurredAt: new Date().toISOString(), token: "DO-NOT-LOG", recorderToken: "DO-NOT-LOG", caption: "DO-NOT-LOG" }));
        assert.equal(response.status, 204); assert.equal(records[0][1].reason, "TOKEN_EXPIRE");
        assert.ok(!JSON.stringify(records).includes("DO-NOT-LOG"));
      } finally { console.info = log; }
    });
    console.log(JSON.stringify({ checks: results.length, passed: results }));
  } finally {
    if (lock) { await lock.query("ROLLBACK"); lock.release(); }
    await db.classroomConnection.deleteMany({ where: { sessionId: lesson.id } });
    await db.course.delete({ where: { id: course.id } });
    await db.$disconnect(); await pool.end();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
