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
  await esbuild.build({ stdin: { contents: `export {prisma} from './src/lib/db';export * from './src/lib/classroom/server/connections';export * from './src/lib/classroom/server/attendance-entry';export {POST as renew} from './src/app/api/classroom/session/renew-credential/route';export {POST as heartbeat} from './src/app/api/courses/[id]/classroom/actions/route';export {POST as diagnostic} from './src/app/api/classroom/connection-diagnostics/route';`, resolveDir: root },
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
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, status: "live", refreshed: true });
    });
    await check("locked connection returns retryable 503 instead of reporting a refreshed lease", async () => {
      const before = new Date(Date.now() - 60_000);
      await db.classroomConnection.update({ where: { id }, data: { lastSeenAt: before } });
      lock = await pool.connect(); await lock.query("BEGIN");
      await lock.query('SELECT "id" FROM "ClassroomConnection" WHERE "id"=$1 FOR UPDATE', [id]);
      const started = Date.now();
      const response = await api.heartbeat(request({ clientId, presenceOnly: true, action: { type: "heartbeat" } }), { params: Promise.resolve({ id: lesson.id }) });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "heartbeat_busy");
      assert.equal(response.headers.get("Retry-After"), "2");
      assert.ok(Date.now() - started < 800);
      assert.equal((await db.classroomConnection.findUnique({ where: { id } })).lastSeenAt.getTime(), before.getTime());
      await lock.query("ROLLBACK"); lock.release(); lock = null;
      assert.equal((await api.touchClassroomConnection(lesson.id, userId, clientId)).refreshed, true);
    });
    await check("pagehide retains stage grants, rejoin restores presence, explicit leave and late beacons remain offline", async () => {
      await db.classroomMemberState.update({ where: { id: member.id }, data: { onStage: true, stageState: "accepted", whiteboardWritable: true } });
      await api.leaveClassroomConnection(lesson.id, userId, clientId, false);
      let current = await db.classroomMemberState.findUnique({ where: { id: member.id } });
      assert.equal(current.presence, "reconnecting"); assert.equal(current.onStage, true); assert.equal(current.whiteboardWritable, true);
      assert.equal((await api.touchClassroomConnection(lesson.id, userId, clientId)).refreshed, false);
      await api.touchClassroomConnection(lesson.id, userId, clientId, true);
      current = await db.classroomMemberState.findUnique({ where: { id: member.id } });
      assert.equal(current.presence, "online"); assert.equal(current.onStage, true);
      await api.leaveClassroomConnection(lesson.id, userId, clientId, true);
      await api.leaveClassroomConnection(lesson.id, userId, clientId, false);
      current = await db.classroomMemberState.findUnique({ where: { id: member.id } });
      assert.equal(current.presence, "offline"); assert.equal(current.onStage, false); assert.equal(current.whiteboardWritable, false);
      await api.touchClassroomConnection(lesson.id, userId, clientId, true);
    });
    await check("accepted student renewal preserves publishing authorization", async () => {
      await db.classroomMemberState.update({ where: { id: member.id }, data: { onStage: true, stageState: "accepted", cameraAllowed: false } });
      const body = await (await api.renew(request({ sessionId: lesson.id, clientId }))).json();
      assert.equal(body.credential.publisher, true); assert.equal(body.credential.allowAuxiliaryCamera, false);
    });
    await check("concurrent bootstrap retries create exactly one active attendance entry", async () => {
      const entry = { courseId: course.id, sessionId: lesson.id, userId, displayName: "Student", avatar: "", clientId };
      await Promise.all(Array.from({ length: 8 }, () => api.recordClassroomAttendanceEntry(entry)));
      assert.equal(await db.courseAttendance.count({ where: { sessionId: lesson.id } }), 1);
      assert.equal(await db.courseAttendance.count({ where: { sessionId: lesson.id, leftAt: null } }), 1);
      const first = await db.courseAttendance.findFirst({ where: { sessionId: lesson.id } });
      await api.recordClassroomAttendanceEntry(entry);
      assert.equal((await db.courseAttendance.findUnique({ where: { id: first.id } })).leftAt, null);
      await api.recordClassroomAttendanceEntry({ ...entry, clientId: "new-entry-client" });
      assert.equal(await db.courseAttendance.count({ where: { sessionId: lesson.id } }), 2);
      assert.equal(await db.courseAttendance.count({ where: { sessionId: lesson.id, leftAt: null } }), 1);
      // A delayed retry from the earlier tab must not close the newer entry.
      await api.recordClassroomAttendanceEntry(entry);
      assert.equal(await db.courseAttendance.count({ where: { sessionId: lesson.id, leftAt: null } }), 1);
    });
    await check("a second device must choose before joining; together keeps one member and two leases", async () => {
      const deviceUser = "device-user";
      await db.classroomMemberState.create({ data: { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, userId: deviceUser, displayName: "Device student", role: "student", presence: "online", onStage: true, stageState: "accepted", cameraAllowed: true, microphoneAllowed: true, whiteboardWritable: true } });
      assert.equal((await api.touchClassroomConnection(lesson.id, deviceUser, "device-client-a", true, { deviceId: "browser-device-a", deviceLabel: "Mac · Chrome" })).entryMode, "primary");
      await db.classroomConnection.updateMany({ where: { sessionId: lesson.id, userId: deviceUser }, data: { lastSeenAt: new Date(Date.now() - 600_000) } });
      await assert.rejects(api.touchClassroomConnection(lesson.id, deviceUser, "device-client-b", true, { deviceId: "browser-device-b" }), error => error.name === "ClassroomDeviceConflictError");
      assert.equal(await db.classroomConnection.count({ where: { sessionId: lesson.id, userId: deviceUser } }), 1);
      assert.equal((await api.touchClassroomConnection(lesson.id, deviceUser, "device-client-b", true, { deviceId: "browser-device-b", mode: "together" })).entryMode, "together");
      assert.equal(await db.classroomMemberState.count({ where: { sessionId: lesson.id, userId: deviceUser } }), 1);
      assert.equal(await db.classroomConnection.count({ where: { sessionId: lesson.id, userId: deviceUser, leftAt: null } }), 2);
      // An idempotent retry cannot close a peer admitted after its first response.
      await api.touchClassroomConnection(lesson.id, deviceUser, "device-client-b", true, { deviceId: "browser-device-b", mode: "replace" });
      assert.equal(await db.classroomConnection.count({ where: { sessionId: lesson.id, userId: deviceUser, leftAt: null } }), 2);
    });
    await check("refresh retains together mode, replaces only the old same-browser lease, and fences it", async () => {
      const deviceUser = "device-user";
      await api.leaveClassroomConnection(lesson.id, deviceUser, "device-client-b", false);
      assert.equal((await api.touchClassroomConnection(lesson.id, deviceUser, "device-client-b2", true, { deviceId: "browser-device-b" })).entryMode, "together");
      assert.equal(await db.classroomConnection.count({ where: { sessionId: lesson.id, userId: deviceUser, leftAt: null } }), 2);
      await assert.rejects(api.touchClassroomConnection(lesson.id, deviceUser, "device-client-b", true, { deviceId: "browser-device-b" }), error => error.name === "ClassroomConnectionReplacedError");
      assert.equal((await api.touchClassroomConnection(lesson.id, deviceUser, "device-client-b")).reason, "replaced");
    });
    await check("replacement releases old sharing and captions, fences credentials and actions, and survives late beacons", async () => {
      const deviceUser = "device-user";
      await db.classroomConnection.updateMany({ where: { sessionId: lesson.id, userId: deviceUser }, data: { captionLanguage: "en" } });
      await db.classroomRuntime.update({ where: { id: runtime.id }, data: { composition: { screenShares: { main: { userId: deviceUser, clientId: "device-client-a", rtcUid: 123, claimId: "old-share" } } } } });
      await api.touchClassroomConnection(lesson.id, deviceUser, "device-client-c", true, { deviceId: "browser-device-c", mode: "replace" });
      const connections = await db.classroomConnection.findMany({ where: { sessionId: lesson.id, userId: deviceUser } });
      assert.equal(connections.filter(row => !row.leftAt).length, 1);
      assert.ok(connections.filter(row => row.id.endsWith(":device-client-a") || row.id.endsWith(":device-client-b2")).every(row => row.replacedAt && row.captionLanguage === null));
      assert.deepEqual((await db.classroomRuntime.findUnique({ where: { id: runtime.id } })).composition.screenShares, {});
      const prior = globalThis.connectionActor;
      globalThis.connectionActor = { ...prior, userId: deviceUser };
      try {
        const renewed = await api.renew(request({ sessionId: lesson.id, clientId: "device-client-a" }));
        assert.equal(renewed.status, 409); assert.equal((await renewed.json()).code, "classroom_connection_replaced");
        const heartbeat = await api.heartbeat(request({ clientId: "device-client-a", presenceOnly: true, action: { type: "heartbeat" } }), { params: Promise.resolve({ id: lesson.id }) });
        assert.equal(heartbeat.status, 409); assert.equal((await heartbeat.json()).code, "classroom_connection_replaced");
        const action = await api.heartbeat(request({ clientId: "device-client-a", action: { type: "raiseHand" }, compactHandRaise: true }), { params: Promise.resolve({ id: lesson.id }) });
        assert.equal(action.status, 409);
      } finally { globalThis.connectionActor = prior; }
      await api.leaveClassroomConnection(lesson.id, deviceUser, "device-client-a", true);
      const member = await db.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId: lesson.id, userId: deviceUser } } });
      assert.equal(member.onStage, true); assert.equal(member.cameraAllowed, true); assert.equal(member.whiteboardWritable, true);
      await assert.rejects(api.touchClassroomConnection(lesson.id, deviceUser, "device-client-a2", true, { deviceId: "browser-device-a" }), error => error.name === "ClassroomDeviceConflictError");
    });
    await check("simultaneous first devices serialize admission instead of both silently joining", async () => {
      const deviceUser = "device-race";
      await db.classroomMemberState.create({ data: { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, userId: deviceUser, displayName: "Race", role: "student" } });
      const outcomes = await Promise.allSettled(["one", "two"].map(suffix => api.touchClassroomConnection(lesson.id, deviceUser, "race-client-" + suffix, true, { deviceId: "race-device-" + suffix })));
      assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter(result => result.status === "rejected" && result.reason.name === "ClassroomDeviceConflictError").length, 1);
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
