// Actual entry/leave routes + business SQL on disposable PostgreSQL. Identity,
// media credential signing and post-response external services are fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const esbuild = require('esbuild');
const { Pool } = require('pg');
const root = path.resolve(__dirname, '../..');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (url.hostname !== '127.0.0.1' || !url.pathname.startsWith('/classroom_recovery_')) throw new Error('Disposable loopback database required');
async function run() {
  const output = path.join(root, 'node_modules/.cache/entry-recovery.cjs');
  await fs.mkdir(path.dirname(output), { recursive: true });
  const mocks = {
    'server-only': '',
    'next/server': "export {NextRequest,NextResponse} from 'next/server.js';export const after=()=>{};",
    '@/lib/session': "export async function getSessionFromRequest(r){const userId=r.headers.get('x-test-user');return userId?{userId,name:userId,displayName:userId}:null;}",
    '@/lib/course-session-access': "export async function resolveCourseSessionAccess(id,userId){globalThis.entryAccessChecks++;return {ok:true,sessionId:id,courseId:globalThis.entryCourseId,role:'student',teacherName:'Fixture teacher',teacherId:'teacher'};}",
    '@/lib/classroom/server/request-access': "export async function resolveClassroomRequestAccess(r,id){const userId=r.headers.get('x-test-user');return userId?{ok:true,session:{userId},access:{sessionId:id,courseId:globalThis.entryCourseId,role:'student'}}:{ok:false,status:401,error:'Unauthorized'};}",
    '@/lib/classroom/server/provider-factory': "export const getClassroomServerProvider=()=>({issueCredential:input=>{globalThis.entryCredentials++;return {...input,provider:'agora',rtcUid:123,token:'isolated-fixture'};}});export const getRecordingProvider=()=>({isConfigured:()=>false});",
    '@/lib/classroom/server/recording-orchestrator': "export const recoverInterruptedRecordingForSession=async()=>{};",
    '@/lib/classroom/server/transcription-orchestrator': "export const classroomInterpretationAvailability=async()=>({});export const syncClassroomTranscription=async()=>{};",
    '@/lib/classroom/signaling/agora-server': "export const issueAgoraSignalingCredential=()=>null;",
    '@/lib/classroom/whiteboard/provider-factory': "export const getWhiteboardProvider=()=>({});",
  };
  await esbuild.build({ stdin: { contents: `export {prisma,databasePoolSnapshot} from './src/lib/db';export {requestClassroomSession} from './src/lib/classroom/session-request';export {POST as join} from './src/app/api/classroom/session/route';export {POST as leave} from './src/app/api/classroom/session/leave/route';`, resolveDir: root }, outfile: output,
    bundle: true, packages: 'external', platform: 'node', format: 'cjs', tsconfig: path.join(root, 'tsconfig.json'),
    plugins: [{ name: 'external-fixtures', setup(build) {
      build.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: root }));
    } }] });
  globalThis.entryCredentials = 0; globalThis.entryAccessChecks = 0;
  const api = require(output), db = api.prisma;
  let transactionStarts = 0;
  const transact = db.$transaction.bind(db);
  db.$transaction = (...args) => { transactionStarts++; return transact(...args); };
  const observer = new Pool({ connectionString: url.href, max: 1 });
  const course = await db.course.create({ data: { name: 'Entry regression', ownerId: 'teacher', ownerName: 'Teacher', teacherId: 'teacher', teacherName: 'Teacher', autoStudentOnStage: false } });
  globalThis.entryCourseId = course.id;
  const endTime = new Date(Date.now() + 3600000);
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: 'Entry regression', createdBy: 'teacher', status: 'live', startTime: new Date(), endTime } });
  await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: 'live' } });
  const request = (userId, body) => new Request('http://localhost/api/classroom/session', { method: 'POST', headers: { 'content-type': 'application/json', ...(userId ? { 'x-test-user': userId } : {}) }, body: JSON.stringify({ sessionId: lesson.id, ...body }) });
  const join = (userId, clientId, extra = {}) => api.join(request(userId, { clientId, deviceId: `device-${userId}`, ...extra }));
  const checks = [];
  let blocker;
  try {
    assert.equal((await join(null, 'unauthorized-client')).status, 401);
    assert.equal(await db.classroomConnection.count({ where: { sessionId: lesson.id } }), 0);
    checks.push('unauthenticated entry denied before any connection creation');
    assert.equal((await join('warmup', 'warmup-client')).status, 200);
    await db.course.update({ where: { id: course.id }, data: { autoStudentOnStage: true } });
    const beforeAdmission = transactionStarts;
    const staged = await join('auto-stage-user', 'auto-stage-client');
    assert.equal(staged.status, 200);
    assert.equal((await staged.json()).credential.publisher, true);
    assert.equal(transactionStarts - beforeAdmission, 1, 'member stage admission and lease registration must share exactly one transaction');
    checks.push('automatic stage admission plus connection registration uses one transaction');
    const beforeCredentials = globalThis.entryCredentials, beforeAccess = globalThis.entryAccessChecks;
    const duplicates = await Promise.all(Array.from({ length: 8 }, () => join('same-user', 'same-client')));
    assert.ok(duplicates.every(response => response.status === 200));
    await Promise.all(duplicates.map(response => response.json()));
    assert.equal(globalThis.entryCredentials - beforeCredentials, 1);
    assert.equal(globalThis.entryAccessChecks - beforeAccess, 8);
    assert.equal(await db.classroomConnection.count({ where: { sessionId: lesson.id, userId: 'same-user' } }), 1);
    checks.push('8 duplicate entry requests: 8 access checks, 1 bootstrap, independently readable responses');
    const initialStatuses = [];
    const burst = await Promise.all(Array.from({ length: 24 }, (_, i) => api.requestClassroomSession({
      signal: new AbortController().signal,
      request: async () => {
        const response = await join(`burst-${i}`, `burst-client-${i}`);
        initialStatuses.push(response.status);
        return response;
      },
    })));
    assert.ok(burst.every(payload => payload.credential));
    checks.push(`24 different students enter concurrently through actual client retry and entry route (${initialStatuses.length} total attempts)`);
    assert.equal((await api.leave(request('same-user', { clientId: 'same-client', voluntary: true }))).status, 200);
    assert.equal((await join('same-user', 'return-client')).status, 200);
    // An old page's delayed beacon must not take down its replacement.
    assert.equal((await api.leave(request('same-user', { clientId: 'same-client' }))).status, 200);
    const current = await db.classroomConnection.findUnique({ where: { id: `${lesson.id}:same-user:return-client` } });
    assert.equal(current.leftAt, null);
    assert.equal((await db.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId: lesson.id, userId: 'same-user' } } })).presence, 'online');
    checks.push('voluntary leave, same-device re-entry and delayed old-page beacon preserve new connection');
    blocker = await observer.connect(); await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM "ClassroomRuntime" WHERE "sessionId"=$1 FOR UPDATE', [lesson.id]);
    assert.equal((await join('locked-user', 'locked-client')).status, 503);
    assert.equal(await db.classroomMemberState.count({ where: { sessionId: lesson.id, userId: 'locked-user' } }), 0, 'failed join must not leave a partially initialized member');
    assert.equal((await api.leave(request('same-user', { clientId: 'return-client', voluntary: true }))).status, 503);
    await blocker.query('ROLLBACK'); blocker.release(); blocker = null;
    assert.equal((await join('locked-user', 'locked-client')).status, 200);
    assert.equal((await api.leave(request('same-user', { clientId: 'return-client', voluntary: true }))).status, 200);
    assert.equal((await join('same-user', 'after-lock-client')).status, 200);
    checks.push('real runtime row lock: entry/leave return retryable 503; both recover and re-entry succeeds after unlock');
    await assert.rejects(db.$queryRaw`SELECT pg_sleep(8)`, /statement timeout/);
    await db.$queryRaw`SELECT 1`;
    const idle = await observer.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state LIKE 'idle in transaction%' AND pid<>pg_backend_pid()");
    assert.equal(idle.rows[0].n, 0);
    checks.push('server cancels slow SQL, pool accepts next query, no idle transactions remain');
    console.log(JSON.stringify({ passed: true, pool: api.databasePoolSnapshot(), checks, boundary: 'PostgreSQL and actual route/business code; identity, credential signing and external after-response services are fixtures; no RTC media or production changes' }, null, 2));
  } finally {
    if (blocker) { await blocker.query('ROLLBACK'); blocker.release(); }
    await db.course.delete({ where: { id: course.id } });
    await db.$disconnect(); await observer.end();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
