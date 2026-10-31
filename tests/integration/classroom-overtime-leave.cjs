/* eslint-disable @typescript-eslint/no-require-imports -- Isolated PostgreSQL; actual routes and services, simulated cloud boundary. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const esbuild = require('esbuild');
const { Client } = require('pg');

async function main() {
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.hostname, '127.0.0.1');
  assert.equal(database.pathname, '/classroom_overtime_leave_test');
  process.env.CLASSROOM_REDIS_URL = '';
  process.env.REDIS_URL = '';
  process.env.COURSE_FINISHED_DELAY_MINUTES = '30';
  process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL = 'https://isolated.invalid/events';
  process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET = 'isolated-fixture';
  const root = path.resolve(__dirname, '../..');
  await fs.mkdir(path.join(root, 'outputs/classroom-overtime-leave-2026-10-31'), { recursive: true });
  const outfile = path.join(root, 'node_modules/.cache/classroom-overtime-leave.cjs');
  globalThis.overtimeAfter = [];
  globalThis.overtimeCloudStops = [];
  globalThis.overtimeStopFailures = false;
  globalThis.overtimeRedisFailure = false;
  globalThis.overtimeQueryModes = new Map();
  globalThis.overtimeQueries = [];
  globalThis.overtimeProvider = {
    name: 'agora', isConfigured: () => true, validateConfiguration() {},
    stop: async input => {
      globalThis.overtimeCloudStops.push(input.providerSessionId);
      if (globalThis.overtimeStopFailures) throw new Error('simulated cloud timeout');
      return { files: [], providerState: { serverResponse: { status: 6 } } };
    },
    query: async input => {
      globalThis.overtimeQueries.push(input.providerSessionId);
      const mode = globalThis.overtimeQueryModes.get(input.providerSessionId);
      if (mode === 'throw') throw new Error('simulated query outage');
      return { active: mode === 'active', files: [], providerState: { serverResponse: { status: mode === 'active' ? 5 : 8 }, queryVerified: true } };
    },
  };
  const stubs = {
    'server-only': '',
    'next/server': 'export const NextResponse=Response; export const after=callback=>globalThis.overtimeAfter.push(callback);',
    '@/lib/classroom/server/request-access': `export async function resolveClassroomRequestAccess(request, sessionId){
      const userId=request.headers.get('x-test-user'); if(!userId)return{ok:false,status:401,error:'Unauthorized'};
      const member=await globalThis.overtimeDb.classroomMemberState.findUnique({where:{sessionId_userId:{sessionId,userId}}});
      return member?{ok:true,session:{userId},access:{courseId:member.courseId,sessionId,role:member.role}}:{ok:false,status:403,error:'Forbidden'};}`,
    '@/lib/course-session-access': 'export const clearCourseSessionAccessCache=()=>{};',
    '@/lib/classroom/server/redis': 'export const classroomRedisEnabled=()=>false; export const classroomPgFallback=async(_key,fn)=>fn(); export const classroomRedisCommand=async()=>null; export const classroomRedisKey=key=>key;',
    '@/lib/classroom/server/redis-sync': `export const registerClassroomRedisConnection=async()=>{}; export const refreshClassroomRedisControl=async()=>{}; export const synchronizeClassroomRedis=async()=>{if(globalThis.overtimeRedisFailure)throw Error('simulated Redis outage')};`,
    '@/lib/classroom/server/redis-presence': 'export const redisClassroomHeartbeat=async()=>null; export const readRedisClassroomPresence=async()=>null; export const overlayRedisClassroomPresence=()=>{}; export const claimRedisEmptyClassroom=async()=>false; export const releaseRedisEmptyClassroom=async()=>{};',
    '@/lib/classroom/server/provider-factory': 'export const getRecordingProvider=()=>globalThis.overtimeProvider; export const getClassroomServerProvider=()=>({});',
    '@/lib/classroom/server/recorder-token': 'export const createRecorderPageUrl=async()=>"https://isolated.invalid/recorder"; export const assertRecorderPageReachable=async()=>{}; export const isRecorderPageConfigured=()=>true; export const verifyRecorderToken=async()=>false;',
    '@/lib/classroom/server/transcription-orchestrator': 'export const syncClassroomTranscription=async()=>{}; export const stopClassroomTranscription=async()=>{};',
    '@/lib/course-session-summary-generation': 'export const queueCourseSessionSummary=async()=>{}; export const processCourseSessionSummaryGeneration=async()=>{};',
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from '@/lib/db'; export {POST} from '@/app/api/classroom/session/leave/route'; export {leaveClassroomConnection,touchClassroomConnection} from '@/lib/classroom/server/connections'; export {closeEmptyClassrooms} from '@/lib/classroom/server/empty-room'; export {ensureClassroomRuntime} from '@/lib/classroom/server/runtime'; export {reconcileRecordingAttempt,reconcilePendingRecordings,stopActiveRecordingsForCourse,requestRecordingStart} from '@/lib/classroom/server/recording-orchestrator'; export {changeClassroomTiming} from '@/lib/classroom/server/class-timing';`, resolveDir: root },
    outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', tsconfig: path.join(root, 'tsconfig.json'),
    plugins: [{ name: 'isolated-boundaries', setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        let key = args.path;
        if (args.path.startsWith('.') && args.importer) {
          const resolved = path.resolve(path.dirname(args.importer), args.path);
          key = resolved.startsWith(path.join(root, 'src') + path.sep) ? '@/' + path.relative(path.join(root, 'src'), resolved).split(path.sep).join('/') : key;
        }
        return key in stubs ? { path: key, namespace: 'stub' } : undefined;
      });
      build.onLoad({ filter: /server[\\/]integration-events\.ts$/ }, async args => ({ contents: (await fs.readFile(args.path, 'utf8')).split('export async function deliverClassroomEvents')[0] + 'export const deliverClassroomEvents=async()=>({delivered:0,failed:0});', loader: 'ts', resolveDir: path.dirname(args.path) }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }));
    } }],
  });
  const api = require(outfile), db = api.prisma;
  globalThis.overtimeDb = db;
  const courses = [], checks = [];
  const ago = ms => new Date(Date.now() - ms);
  async function fixture(people = [['teacher', 'teacher']], overtime = true) {
    const course = await db.course.create({ data: { name: 'Overtime fixture', ownerId: 'teacher', ownerName: 'Teacher', teacherId: 'teacher', teacherName: 'Teacher', status: 'live', startTime: ago(7200_000), endTime: ago(overtime ? 60_000 : -3600_000) } });
    courses.push(course.id);
    const lesson = await db.courseSession.create({ data: { courseId: course.id, title: 'Lesson', position: 1, roomUuid: crypto.randomUUID(), roomType: 4, createdBy: 'teacher', status: 'live', startTime: ago(7200_000), endTime: course.endTime } });
    const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: 'live', startedAt: lesson.startTime, graceEndsAt: new Date(+lesson.endTime + 1800_000) } });
    for (const [userId, role] of people) {
      await db.classroomMemberState.create({ data: { courseId: course.id, sessionId: lesson.id, runtimeId: runtime.id, userId, role, displayName: userId, presence: 'online' } });
      await api.touchClassroomConnection(lesson.id, userId, userId + '-device01', true);
    }
    const recording = await db.classroomRecording.create({ data: { courseId: course.id, sessionId: lesson.id, provider: 'agora', channelName: 'fixture', recorderUserId: 'bot', status: 'recording', mode: 'web', resourceId: 'resource', providerSessionId: crypto.randomUUID(), startedAt: lesson.startTime, providerState: { mode: 'web' } } });
    return { course, lesson, runtime, recording };
  }
  async function leave(f, userId = 'teacher', intent = 'finishIfLastTeacher', extra = {}) {
    const body = { sessionId: f.lesson.id, clientId: userId + '-device01', voluntary: true, leaveIntent: intent, cycleStartedAt: f.runtime.startedAt.toISOString(), ...extra };
    const response = await api.POST(new Request('http://localhost/api/classroom/session/leave', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': userId }, body: JSON.stringify(body) }));
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const live = async f => assert.equal((await db.classroomRuntime.findUniqueOrThrow({ where: { id: f.runtime.id } })).status, 'live');
  const drain = async () => { for (const callback of globalThis.overtimeAfter.splice(0)) await callback(); };
  const pass = name => { checks.push(name); console.log('PASS ' + name); };
  async function waitForDatabase(predicate) {
    const deadline = Date.now() + 750;
    while (!await predicate()) {
      assert(Date.now() < deadline, 'Timed out waiting for a database concurrency barrier');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  async function orderedRace(connectionId, first, second) {
    const control = new Client({ connectionString: process.env.DATABASE_URL });
    await control.connect();
    const capture = promise => promise.then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }));
    let firstResult, secondResult;
    try {
      await db.$executeRawUnsafe(`CREATE FUNCTION overtime_race_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id" = TG_ARGV[0] THEN PERFORM pg_advisory_xact_lock(42031,1); END IF; RETURN NEW; END; $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER overtime_race_gate BEFORE INSERT OR UPDATE ON "ClassroomConnection" FOR EACH ROW EXECUTE FUNCTION overtime_race_gate('${connectionId.replaceAll("'", "''")}')`);
      await control.query('SELECT pg_advisory_lock(42031,1)');
      firstResult = capture(first());
      await waitForDatabase(async () => (await control.query("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=42031 AND objid=1 AND NOT granted) AS ready")).rows[0].ready);
      secondResult = capture(second());
      await waitForDatabase(async () => Number((await control.query("SELECT COUNT(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")).rows[0].n) >= 2);
      await control.query('SELECT pg_advisory_unlock(42031,1)');
      return await Promise.all([firstResult, secondResult]);
    } finally {
      await control.query('SELECT pg_advisory_unlock(42031,1)');
      await Promise.all([firstResult, secondResult]);
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS overtime_race_gate ON "ClassroomConnection"');
      await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS overtime_race_gate()');
      await control.end();
    }
  }
  const forceStopDue = async id => {
    const recording = await db.classroomRecording.findUniqueOrThrow({ where: { id } });
    await db.classroomRecording.update({ where: { id }, data: { providerState: { ...recording.providerState,
      stopControl: { ...recording.providerState.stopControl, nextAt: 0 } } } });
  };
  try {
    const f = await fixture();
    assert.equal((await leave(f)).classEnded, true);
    const state = await db.classroomRecording.findUniqueOrThrow({ where: { id: f.recording.id } });
    assert.equal(state.status, 'stopping'); assert(state.stopRequestedAt); assert.equal(globalThis.overtimeCloudStops.length, 0);
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: f.lesson.id, payload: { path: ['reason'], equals: 'last_teacher_overtime_leave' } } }), 1);
    await drain(); assert(globalThis.overtimeCloudStops.includes(f.recording.providerSessionId));
    await leave(f); await drain();
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: f.lesson.id, payload: { path: ['type'], equals: 'classroom.ended' } } }), 1);
    pass('last overtime teacher atomically queues stop and one ended event; duplicate requests are harmless');

    const normal = await fixture(undefined, false); assert.equal((await leave(normal)).classEnded, false); await live(normal);
    const temporary = await fixture(); await leave(temporary, 'teacher', 'temporary'); await live(temporary);
    await db.classroomConnection.updateMany({ where: { sessionId: temporary.lesson.id }, data: { lastSeenAt: ago(600_000), leftAt: ago(600_000) } });
    assert.equal(await api.closeEmptyClassrooms([temporary.course.id], new Date()), 0); await live(temporary);
    pass('normal-time and temporary exits keep recording; empty-room cleanup respects temporary leave');

    for (const voluntary of [false, undefined]) {
      const refresh = await fixture();
      await leave(refresh, 'teacher', undefined, { voluntary, leaveIntent: undefined, cycleStartedAt: undefined });
      await live(refresh);
      assert.equal((await db.classroomConnection.findUniqueOrThrow({ where: { id: refresh.lesson.id + ':teacher:teacher-device01' } })).leaveIntent, 'disconnected');
    }
    const prejoined = await fixture();
    await db.classroomConnection.updateMany({ where: { sessionId: prejoined.lesson.id }, data: { lastSeenAt: new Date(+prejoined.runtime.startedAt - 600_000) } });
    await leave(prejoined, 'teacher', 'temporary');
    assert.equal(await api.closeEmptyClassrooms([prejoined.course.id], new Date(Date.now() + 600_000)), 0);
    await live(prejoined);
    pass('a teacher who entered before class start retains temporary leave even with stale PG heartbeats');
    const oldClient = await fixture(); await leave(oldClient, 'teacher', undefined, { leaveIntent: undefined, cycleStartedAt: undefined }); await live(oldClient);
    pass('refresh/pagehide/network departure and legacy clients never request automatic end');

    for (const intent of ['temporary', 'finishIfLastTeacher']) {
      const reordered = await fixture();
      await leave(reordered, 'teacher', undefined, { voluntary: false, leaveIntent: undefined, cycleStartedAt: undefined });
      assert.equal((await leave(reordered, 'teacher', intent)).classEnded, intent === 'finishIfLastTeacher');
      const connection = await db.classroomConnection.findUniqueOrThrow({ where: { id: reordered.lesson.id + ':teacher:teacher-device01' } });
      assert.equal(connection.leaveIntent, intent);
      await leave(reordered, 'teacher', undefined, { voluntary: false, leaveIntent: undefined });
      assert.equal((await db.classroomConnection.findUniqueOrThrow({ where: { id: connection.id } })).leaveIntent, intent);
      if (intent === 'temporary') await live(reordered);
    }
    pass('pagehide and explicit leave can arrive in either order without losing temporary intent or duplicating end');

    const two = await fixture([['teacher', 'teacher'], ['teacher2', 'teacher'], ['student', 'student']]);
    assert.equal((await leave(two)).classEnded, false); await live(two);
    assert.equal((await leave(two, 'teacher2')).classEnded, true);
    pass('two teachers close only on the last departure; remaining students do not keep recording alive');

    const switchedDevice = await fixture();
    await leave(switchedDevice, 'teacher', 'temporary');
    await api.touchClassroomConnection(switchedDevice.lesson.id, 'teacher', 'teacher-device02', true);
    assert.equal((await leave(switchedDevice, 'teacher', 'finishIfLastTeacher', { clientId: 'teacher-device02' })).classEnded, true,
      "Finishing after returning on another device must release the same teacher\'s previous temporary reservation");
    pass('returning on another device does not leave the same teacher permanently reserved');

    const concurrent = await fixture([['teacher', 'teacher'], ['teacher2', 'teacher']]);
    const departures = await Promise.all([leave(concurrent), leave(concurrent, 'teacher2')]);
    assert.equal(departures.filter(r => r.classEnded).length, 1);
    pass('concurrent teacher exits serialize to exactly one classroom end');

    const redisPresence = await fixture([['teacher', 'teacher'], ['teacher2', 'teacher']]);
    await db.classroomConnection.updateMany({ where: { sessionId: redisPresence.lesson.id, userId: 'teacher2' }, data: { lastSeenAt: new Date(+redisPresence.runtime.startedAt - 600_000) } });
    assert.equal((await leave(redisPresence)).classEnded, false); await live(redisPresence);
    pass('an unclosed teacher with stale PG presence still blocks end when Redis may own newer heartbeats');

    for (let round = 0; round < 4; round++) {
      const simultaneous = await fixture([['teacher', 'teacher'], ['teacher2', 'teacher'], ['teacher3', 'teacher']]);
      const responses = await Promise.all(['teacher','teacher2','teacher3'].flatMap(userId => [leave(simultaneous,userId),leave(simultaneous,userId)]));
      assert.equal(responses.filter(result => result.classEnded).length, 1);
      assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: simultaneous.lesson.id, payload: { path: ['type'], equals: 'classroom.ended' } } }), 1);
    }
    pass('three teachers with simultaneous duplicate exits end exactly once across repeated runs');

    for (const joinFirst of [true, false]) {
      const racing = await fixture([['teacher','teacher'],['teacher2','teacher']]);
      await db.classroomConnection.deleteMany({ where: { sessionId: racing.lesson.id, userId: 'teacher2' } });
      const join = () => api.touchClassroomConnection(racing.lesson.id,'teacher2','teacher2-device02',true);
      const finish = () => leave(racing);
      const target = joinFirst ? racing.lesson.id+':teacher2:teacher2-device02' : racing.lesson.id+':teacher:teacher-device01';
      const results = await orderedRace(target, joinFirst ? join : finish, joinFirst ? finish : join);
      if (joinFirst) {
        assert.equal(results[0].status,'fulfilled'); assert.equal(results[1].status,'fulfilled');
        assert.equal(results[1].value.classEnded,false); await live(racing);
        assert.equal((await db.classroomRecording.findUniqueOrThrow({where:{id:racing.recording.id}})).stopRequestedAt,null);
      } else {
        assert.equal(results[0].status,'fulfilled'); assert.equal(results[0].value.classEnded,true);
        assert.equal(results[1].status,'rejected'); assert.equal(results[1].reason.name,'ClassroomConnectionEndedError');
      }
    }
    pass('join versus final exit has a deterministic database order: admitted teacher prevents end, ended classroom rejects join');

    const replacement = await fixture();
    await db.classroomConnection.updateMany({where:{sessionId:replacement.lesson.id},data:{deviceId:'same-device'}});
    await api.touchClassroomConnection(replacement.lesson.id,'teacher','teacher-device02',true,{deviceId:'same-device'});
    await leave(replacement,'teacher',undefined,{voluntary:false,leaveIntent:undefined,cycleStartedAt:undefined});
    assert.equal((await leave(replacement)).classEnded,false);
    assert.equal((await db.classroomConnection.findUniqueOrThrow({where:{id:replacement.lesson.id+':teacher:teacher-device02'}})).leftAt,null);
    assert.equal((await leave(replacement,'teacher','finishIfLastTeacher',{clientId:'teacher-device02'})).classEnded,true);
    pass('late pagehide and finish from a replaced refresh tab cannot disconnect or stop the new tab');

    const rollback = await fixture();
    await db.$executeRawUnsafe(`CREATE FUNCTION overtime_reject_stop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id"=TG_ARGV[0] THEN RAISE EXCEPTION 'simulated stop queue transaction failure'; END IF; RETURN NEW; END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER overtime_reject_stop BEFORE UPDATE ON "ClassroomRecording" FOR EACH ROW EXECUTE FUNCTION overtime_reject_stop('${rollback.recording.id}')`);
    try { await assert.rejects(()=>leave(rollback),/simulated stop queue transaction failure/); }
    finally { await db.$executeRawUnsafe('DROP TRIGGER overtime_reject_stop ON "ClassroomRecording"');await db.$executeRawUnsafe('DROP FUNCTION overtime_reject_stop()'); }
    await live(rollback);
    assert.equal((await db.classroomConnection.findUniqueOrThrow({where:{id:rollback.lesson.id+':teacher:teacher-device01'}})).leftAt,null);
    assert.equal((await db.courseSession.findUniqueOrThrow({where:{id:rollback.lesson.id}})).endedAt,null);
    assert.equal((await db.classroomRecording.findUniqueOrThrow({where:{id:rollback.recording.id}})).stopRequestedAt,null);
    pass('a failure to queue stop rolls back departure and classroom end together');

    const multi = await fixture(); await api.touchClassroomConnection(multi.lesson.id, 'teacher', 'teacher-device02', true);
    assert.equal((await leave(multi)).classEnded, false);
    assert.equal((await leave(multi, 'teacher', 'finishIfLastTeacher', { clientId: 'teacher-device02' })).classEnded, true);
    pass('the same teacher on a second device keeps the classroom open');

    for (const intent of ['temporary', undefined]) {
      const reconnect = await fixture([['teacher', 'teacher'], ['teacher2', 'teacher']]);
      await leave(reconnect, 'teacher2', intent, intent ? {} : { voluntary: false, leaveIntent: undefined });
      assert.equal((await leave(reconnect)).classEnded, false); await live(reconnect);
      await api.touchClassroomConnection(reconnect.lesson.id, 'teacher2', 'teacher2-device01', true);
      const row = await db.classroomConnection.findUniqueOrThrow({ where: { id: reconnect.lesson.id + ':teacher2:teacher2-device01' } });
      assert.equal(row.leaveIntent, null); assert.equal(row.leftAt, null);
      pass('another teacher ' + (intent ? 'temporarily absent' : 'reconnecting') + ' prevents end; rejoin clears departure intent');
    }

    const stale = await fixture();
    assert.equal((await leave(stale, 'teacher', 'finishIfLastTeacher', { cycleStartedAt: ago(86400_000).toISOString() })).classEnded, false);
    assert.equal((await db.classroomConnection.findUniqueOrThrow({ where: { id: stale.lesson.id + ':teacher:teacher-device01' } })).leftAt, null);
    await db.classroomConnection.updateMany({ where: { sessionId: stale.lesson.id }, data: { replacedAt: new Date() } });
    assert.equal((await leave(stale)).classEnded, false); await live(stale);
    pass('old class-cycle commands and replaced devices cannot end the current class');

    const extended = await fixture(); await db.courseSession.update({ where: { id: extended.lesson.id }, data: { endTime: new Date(Date.now() + 3600_000) } });
    assert.equal((await leave(extended)).classEnded, false); await live(extended);
    pass('authoritative rescheduling wins over a stale overtime dialog');

    const outage = await fixture(); globalThis.overtimeStopFailures = true; globalThis.overtimeRedisFailure = true;
    assert.equal((await leave(outage)).classEnded, true); await drain();
    const pending = await db.classroomRecording.findUniqueOrThrow({ where: { id: outage.recording.id } });
    assert(pending.stopRequestedAt); assert.notEqual(pending.status, 'completed');
    globalThis.overtimeStopFailures = false; globalThis.overtimeRedisFailure = false;
    await db.classroomRecording.update({ where: { id: pending.id }, data: { providerState: { ...pending.providerState, stopControl: { ...pending.providerState.stopControl, nextAt: 0 } } } });
    await api.reconcileRecordingAttempt(pending.id);
    assert((await db.classroomRecording.findUniqueOrThrow({ where: { id: pending.id } })).stoppedAt);
    pass('Redis/cloud outage cannot undo committed end; durable reconciliation verifies provider shutdown');

    await drain();
    const recovery = await fixture();
    assert.equal((await leave(recovery)).classEnded,true);
    globalThis.overtimeAfter=[]; // Simulate the request worker exiting before after() runs.
    globalThis.overtimeStopFailures=true;
    globalThis.overtimeQueryModes.set(recovery.recording.providerSessionId,'active');
    await api.reconcilePendingRecordings();
    const stopCount=()=>globalThis.overtimeCloudStops.filter(sid=>sid===recovery.recording.providerSessionId).length;
    assert.equal(stopCount(),1,'cron must discover the durable stop without a request callback');
    await Promise.all([api.reconcilePendingRecordings(),api.reconcilePendingRecordings()]);
    assert.equal(stopCount(),1,'backoff must survive repeated cron runs');
    await forceStopDue(recovery.recording.id);
    await Promise.all([api.reconcilePendingRecordings(),api.reconcilePendingRecordings()]);
    assert.equal(stopCount(),1,'query a failed/uncertain stop before retrying it');
    await forceStopDue(recovery.recording.id);
    globalThis.overtimeStopFailures=false;
    await Promise.all([api.reconcilePendingRecordings(),api.reconcilePendingRecordings()]);
    assert.equal(stopCount(),2,'concurrent workers retry the same SID once');
    globalThis.overtimeQueryModes.set(recovery.recording.providerSessionId,'exited');
    await forceStopDue(recovery.recording.id);
    await api.reconcilePendingRecordings();
    assert((await db.classroomRecording.findUniqueOrThrow({where:{id:recovery.recording.id}})).stoppedAt);
    pass('cron discovers a lost callback, honors backoff, queries before retry and verifies the same cloud task');

    const reopened = await fixture();
    assert.equal((await leave(reopened)).classEnded,true);
    const oldEndCallbacks=globalThis.overtimeAfter.splice(0);
    await db.classroomRuntime.update({where:{id:reopened.runtime.id},data:{transcriptionStatus:'stopped'}});
    const timing=await api.changeClassroomTiming({sessionId:reopened.lesson.id,courseId:reopened.course.id,actorId:'teacher',role:'teacher',action:'reopen',commandId:crypto.randomUUID()});
    assert.equal(timing.recordingId,undefined,"Keep main\'s guard against overlapping unconfirmed cloud tasks");
    await api.reconcilePendingRecordings();
    await forceStopDue(reopened.recording.id);
    await api.reconcilePendingRecordings();
    assert((await db.classroomRecording.findUniqueOrThrow({where:{id:reopened.recording.id}})).stoppedAt);
    const nextRecording=await api.requestRecordingStart(reopened.course.id,reopened.lesson.id);
    assert.notEqual(nextRecording.id,reopened.recording.id);
    const newSid='reopened-'+crypto.randomUUID();
    await db.classroomRecording.update({where:{id:nextRecording.id},data:{status:'recording',providerSessionId:newSid,resourceId:'new-resource',recorderUserId:'new-bot',startedAt:new Date(),providerState:{mode:'web'}}});
    globalThis.overtimeQueryModes.set(newSid,'active');
    for(const callback of oldEndCallbacks)await callback();
    await drain();
    await api.reconcilePendingRecordings();
    assert.equal(globalThis.overtimeCloudStops.includes(newSid),false);
    const newRecording=await db.classroomRecording.findUniqueOrThrow({where:{id:nextRecording.id}});
    assert.equal(newRecording.status,'recording'); assert.equal(newRecording.stopRequestedAt,null);
    pass('a delayed old end callback and background reconciliation cannot stop the reopened class recording');

    const hard = await fixture(); await leave(hard, 'teacher', 'temporary');
    await db.courseSession.update({ where: { id: hard.lesson.id }, data: { endTime: ago(1900_000) } });
    await api.ensureClassroomRuntime(hard.course.id, hard.lesson.id);
    assert.equal((await db.classroomRuntime.findUniqueOrThrow({ where: { id: hard.runtime.id } })).status, 'ended');
    assert((await db.classroomRecording.findUniqueOrThrow({ where: { id: hard.recording.id } })).stopRequestedAt);
    pass('temporary leave never bypasses the hard overtime limit');

    const forbidden = await fixture([['teacher', 'teacher'], ['student', 'student'], ['assistant', 'assistant']]);
    for (const userId of ['student']) {
      const r = await api.POST(new Request('http://localhost/leave', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': userId }, body: JSON.stringify({ sessionId: forbidden.lesson.id, clientId: userId + '-device01', voluntary: true, leaveIntent: 'finishIfLastTeacher', cycleStartedAt: forbidden.runtime.startedAt.toISOString() }) }));
      assert.equal(r.status, 403); await live(forbidden);
    }
    pass('student spoofed finish intent is rejected');
    assert.equal((await leave(forbidden)).classEnded,false,'The assistant still teaching must prevent closure');
    assert.equal((await leave(forbidden,'assistant')).classEnded,true,'An assistant with existing end-class permission can be the final teaching staff member');
    pass('the final assistant uses the same end-class authority as the existing manual end action');
    await fs.writeFile(path.join(root, 'outputs/classroom-overtime-leave-2026-10-31/database-checks.json'), JSON.stringify({ database: 'isolated localhost PostgreSQL', checks, cloudBoundary: 'simulated', passed: true }, null, 2));
  } finally {
    globalThis.overtimeAfter = [];
    await db.classroomConnection.deleteMany({ where: { sessionId: { in: (await db.courseSession.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map(s => s.id) } } });
    await db.classroomIntegrationEvent.deleteMany({ where: { sessionId: { in: (await db.courseSession.findMany({ where: { courseId: { in: courses } }, select: { id: true } })).map(s => s.id) } } });
    await db.course.deleteMany({ where: { id: { in: courses } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
