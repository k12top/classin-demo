/* eslint-disable @typescript-eslint/no-require-imports -- Real action routes and runtime with disposable PostgreSQL; auth/provider boundaries are stubbed. */
const assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs/promises"), esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const database = new URL(process.env.DATABASE_URL || "http://invalid");
assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/classroom_start_verification");
async function main() {
  process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL = "http://127.0.0.1:1/events";
  process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET = "test-only";
  globalThis.recordingRequests = [];
  const stubs = {
    "server-only": "",
    "next/server": "export const NextResponse=Response;export const after=()=>{};",
    "@/lib/classroom/server/request-access": `export const resolveClassroomRequestAccess=async request=>({ok:true,session:JSON.parse(request.headers.get('x-actor')),access:JSON.parse(request.headers.get('x-actor'))});`,
    "@/lib/classroom/server/transcription-orchestrator": "export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};export const stopClassroomTranscription=async()=>{};export const reconcileActiveClassroomTranscriptions=async()=>{};",
    "@/lib/classroom/server/recording-orchestrator": "export const requestRecordingStart=async(courseId,sessionId)=>globalThis.recordingRequests.push(sessionId);export const stopActiveRecordingsForCourse=async()=>{};export const stopRecordingAttempt=async()=>{};export const retryFailedLiveRecordings=async()=>{};export const reconcilePendingRecordings=async()=>{};export const requestRecordingStop=async()=>{};export const processRecordingStop=async()=>{};",
    "@/lib/course-session-summary": "export const reconcileCourseSessionSummaries=async()=>{};",
    "@/lib/course-session-summary-generation": "export const queueCourseSessionSummary=async()=>{};export const processCourseSessionSummaryGeneration=async()=>{};",
    "@/lib/classroom/server/redis-sync": "export const synchronizeClassroomRedis=async()=>{};export const flushClassroomRedisPresence=async()=>{};",
    "@/lib/classroom/server/redis-presence": "export const readRedisClassroomPresence=async()=>null;export const redisClassroomHeartbeat=async()=>null;export const overlayRedisClassroomPresence=s=>s;",
  };
  const outfile = path.join(root, "node_modules/.cache/classroom-class-start.cjs");
  await esbuild.build({ stdin: { contents: `export{prisma}from'@/lib/db';export*from'@/lib/classroom/server/runtime';export*from'@/lib/classroom/server/connections';export{promoteCoursesIfDue}from'@/lib/course-promote';export{POST}from'@/app/api/sessions/[sessionId]/classroom/actions/route';`, resolveDir: root }, outfile, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "boundaries", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const api = require(outfile), db = api.prisma;
  const course = await db.course.create({ data: { name: "Independent class start", teacherId: "teacher", teacherName: "Teacher", ownerId: "teacher", ownerName: "Teacher" } });
  let position = 0;
  const fixture = async (runtime = {}, startTime = new Date(Date.now() - 120_000)) => {
    const lesson = await db.courseSession.create({ data: { courseId: course.id, position: ++position, roomUuid: crypto.randomUUID(), roomType: 4, createdBy: "teacher", startTime, endTime: new Date(+startTime + 3_600_000) } });
    await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, ...runtime } }); return lesson;
  };
  const actor = (lesson, role = "teacher") => ({ userId: role, name: role, displayName: role, avatar: "", role, courseId: course.id, sessionId: lesson.id });
  const post = async (lesson, action, role = "teacher", clientId = "ready-tab-123") => {
    const response = await api.POST(new Request("http://localhost/actions", { method: "POST", headers: { "Content-Type": "application/json", "x-actor": JSON.stringify(actor(lesson, role)) }, body: JSON.stringify({ action, clientId }) }), { params: Promise.resolve({ sessionId: lesson.id }) });
    return { status: response.status, ...await response.json() };
  };
  const join = async (lesson, role = "teacher", clientId = "ready-tab-123") => { await api.touchClassroomMember(course.id, actor(lesson, role), role, undefined, lesson.id); await api.touchClassroomConnection(lesson.id, role, clientId, true); };
  const snapshot = lesson => api.getClassroomRuntimeSnapshot(course.id, lesson.id);
  const ok = async promise => { const result = await promise; assert.equal(result.status, 200, JSON.stringify(result)); return result.runtime; };
  try {
    // Replay the actual migration against legacy rows inside a rolled-back transaction.
    const legacy = await Promise.all(["scheduled", "scheduledEarly", "classStart", "disabled"].map(recordingStartMode => fixture({ recordingStartMode })));
    const sql = await fs.readFile(path.join(root, "prisma/migrations/20261018010000_independent_class_start/migration.sql"), "utf8");
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRawUnsafe('ALTER TABLE "ClassroomRuntime" DROP COLUMN "classStartMode"');
      for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      for (let i = 0; i < legacy.length; i++) {
        const row = await tx.classroomRuntime.findUniqueOrThrow({ where: { sessionId: legacy[i].id } });
        assert.equal(row.classStartMode, i < 2 ? "scheduled" : "manual"); assert.equal(row.recordingStartMode, i === 3 ? "disabled" : "classStart");
      }
      throw new Error("migration rollback");
    }), /migration rollback/);
    await db.courseSession.deleteMany({ where: { id: { in: legacy.map(s => s.id) } } });

    const manual = await fixture(); await join(manual);
    assert.equal((await snapshot(manual)).classStartMode, "manual");
    await api.promoteCoursesIfDue([course.id], { reconcileRecordings: false });
    assert.equal((await snapshot(manual)).status, "waiting", "default reminders cannot start the lesson");
    assert.equal((await ok(post(manual, { type: "startScheduledClass" }))).status, "waiting");
    assert.equal((await ok(post(manual, { type: "setRecordingStartMode", mode: "scheduledEarly" }))).classStartMode, "manual", "legacy recording controls cannot enable class auto-start");
    assert.equal((await ok(post(manual, { type: "setRecordingStartMode", mode: "disabled" }))).status, "waiting");
    await join(manual, "assistant");
    await ok(post(manual, { type: "setAssistantPermission", targetUserId: "assistant", allowed: true }));
    for (const role of ["assistant", "student"]) for (const action of [{ type: "setClassStartMode", mode: "scheduled" }, { type: "startScheduledClass" }, { type: "startClass" }]) assert.equal((await post(manual, action, role)).status, 403);
    assert.equal((await post(manual, { type: "setClassStartMode", mode: "invalid" })).status, 400);

    const absent = await fixture({ classStartMode: "scheduled", recordingStartMode: "disabled" });
    await api.promoteCoursesIfDue([course.id], { reconcileRecordings: false });
    assert.equal((await snapshot(absent)).status, "waiting", "cron/polls cannot start an unattended classroom");
    assert.equal((await ok(post(absent, { type: "startScheduledClass" }))).status, "waiting", "no registered ready connection");
    await join(absent);
    await db.classroomConnection.updateMany({ where: { sessionId: absent.id }, data: { lastSeenAt: new Date(Date.now() - 120_000) } });
    assert.equal((await ok(post(absent, { type: "startScheduledClass" }))).status, "waiting", "stale connection cannot start");
    await join(absent); await api.leaveClassroomConnection(absent.id, "teacher", "ready-tab-123");
    assert.equal((await ok(post(absent, { type: "startScheduledClass" }))).status, "waiting", "a departed tab cannot start");
    await join(absent); await join(absent, "teacher", "ready-tab-456");
    const before = Date.now();
    await Promise.all([post(absent, { type: "startScheduledClass" }), post(absent, { type: "startScheduledClass" }, "teacher", "ready-tab-456"), post(absent, { type: "startClass" })].map(ok));
    const live = await snapshot(absent);
    assert.equal(live.status, "live"); assert.equal(live.recordingStartMode, "disabled");
    assert.ok(Date.parse(live.startedAt) >= before, "late arrival uses actual start, not scheduled start");
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: absent.id, payload: { path: ["type"], equals: "classroom.started" } } }), 1, "concurrent tabs and manual start emit exactly one event");
    await api.promoteCoursesIfDue([course.id], { reconcileRecordings: false });
    assert.ok(!globalThis.recordingRequests.includes(absent.id), "recording disabled remains independent");
    assert.equal((await post(absent, { type: "setClassStartMode", mode: "manual" })).status, 409);

    const future = await fixture({ classStartMode: "scheduled" }, new Date(Date.now() + 30_000)); await join(future);
    assert.equal((await ok(post(future, { type: "startScheduledClass" }))).status, "waiting");
    const readyTeacher = { userId: "teacher", clientId: "ready-tab-123" };
    assert.equal(await api.startScheduledClassroomIfDue(future.id, readyTeacher, new Date(+future.startTime - 1)), false);
    assert.equal(await api.startScheduledClassroomIfDue(future.id, readyTeacher, future.startTime), true);
    const cancelled = await fixture({ classStartMode: "scheduled" }); await join(cancelled);
    await db.courseSession.update({ where: { id: cancelled.id }, data: { status: "cancelled" } });
    assert.equal((await ok(post(cancelled, { type: "startScheduledClass" }))).status, "ended");
    const expired = await fixture({ classStartMode: "scheduled" }, new Date(Date.now() - 4_000_000)); await join(expired);
    assert.equal((await ok(post(expired, { type: "startScheduledClass" }))).status, "waiting", "auto-start does not start after scheduled end");
    assert.equal((await ok(post(manual, { type: "startClass" }))).status, "live", "default manual action still works");
    console.log("PASS: PostgreSQL migrations/legacy preservation, default reminders, settings independence, lead-only API permissions, absent/stale/departed teacher, late actual-time start, concurrent tabs/manual start, exact threshold, cancelled/expired lessons and recording-disabled recovery.");
  } finally { await db.classroomConnection.deleteMany({ where: { sessionId: { in: (await db.courseSession.findMany({ where: { courseId: course.id }, select: { id: true } })).map(s => s.id) } } }); await db.course.delete({ where: { id: course.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
