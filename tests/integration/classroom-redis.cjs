/* eslint-disable @typescript-eslint/no-require-imports -- Real isolated PG/Redis fault tests. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const { Pool } = require('pg');
const root = path.resolve(__dirname, '../..');
for (const [key, prefix] of [['DATABASE_URL','/classroom_recovery_'],['CLASSROOM_REDIS_URL','']]) {
  const url = new URL(process.env[key] || 'http://invalid');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname.startsWith(prefix), 'requires disposable loopback services');
}
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
let passed=0;
function pass(message) { passed++; console.log(`PASS ${message}`); }
async function main() {
  const exports = `export {prisma} from '@/lib/db';export * from '@/lib/classroom/server/runtime';export * from '@/lib/classroom/server/connections';export * from '@/lib/classroom/server/redis';export * from '@/lib/classroom/server/redis-sync';export * from '@/lib/classroom/server/redis-presence';export * from '@/lib/classroom/server/shared-cache';export {POST as heartbeat} from '@/app/api/courses/[id]/classroom/actions/route';`;
  const stubs = {
    'server-only':'',
    '@/lib/classroom/server/integration-events':'export const enqueueClassroomEvent=async()=>{};export const deliverClassroomEvents=async()=>{};',
    '@/lib/classroom/server/request-access':`export async function resolveClassroomRequestAccess(){globalThis.redisAccessReads++;return {ok:true,session:globalThis.redisActor,access:globalThis.redisAccess}}`,
    '@/lib/session':'export const getSessionFromRequest=async()=>globalThis.redisActor;',
    '@/lib/classroom/server/transcription-orchestrator':'export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};',
    '@/lib/classroom/server/recording-orchestrator':'export const requestRecordingStop=async()=>{};export const processRecordingStop=async()=>{};',
    '@/lib/classroom/translation/wordly':'export const ensureWordlyRoom=async()=>{};export const translateCaptionWithWordly=async(_,x)=>x;export const wordlyTranslationCapabilities=async()=>({});',
    'next/server':`export const NextResponse={json:(...args)=>Response.json(...args)};export const after=cb=>globalThis.redisBackground.push(cb);`,
  };
  const options={bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'isolated-services',setup(build){
    build.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'mock'}:undefined);
    build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:stubs[args.path],loader:'js'}));
  }}]};
  const out=path.join(root,'node_modules/.cache/classroom-redis-test.cjs');await fs.mkdir(path.dirname(out),{recursive:true});
  await esbuild.build({...options,stdin:{contents:exports,resolveDir:root},outfile:out});
  const otherOut=out.replace('.cjs','-other.cjs');
  await esbuild.build({...options,stdin:{contents:`export * from '@/lib/classroom/server/shared-cache';`,resolveDir:root},outfile:otherOut});
  const api=require(out),other=require(otherOut),db=api.prisma,pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
  const course=await db.course.create({data:{name:'Redis integration',ownerId:'teacher',ownerName:'Teacher',teacherId:'teacher',teacherName:'Teacher'}});
  const lesson=await db.courseSession.create({data:{courseId:course.id,position:1,roomUuid:crypto.randomUUID(),roomType:4,title:'Redis integration',createdBy:'teacher',startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+3600000),status:'live'}});
  const sid=lesson.id,student={userId:'student',name:'student',displayName:'Student',avatar:''};
  const teacher={...student,userId:'teacher',name:'teacher'};
  const key=suffix=>api.classroomRedisKey(sid,suffix),cmd=args=>api.classroomRedisCommand(args);
  let lock;
  const originalRaw=db.$queryRaw,originalTransaction=db.$transaction;
  const request=(client='redis-client')=>new Request('http://localhost/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:{type:'heartbeat'},presenceOnly:true,clientId:client})});
  const ctx={params:Promise.resolve({id:sid})};
  try {
    await api.ensureClassroomRuntime(course.id,sid);await db.classroomRuntime.update({where:{sessionId:sid},data:{status:'live'}});
    await api.touchClassroomMember(course.id,teacher,'teacher',undefined,sid);
    await api.touchClassroomMember(course.id,student,'student',undefined,sid);
    await api.touchClassroomConnection(sid,'student','redis-client',true);
    globalThis.redisActor=student;globalThis.redisAccess={courseId:course.id,sessionId:sid,role:'student'};globalThis.redisAccessReads=0;globalThis.redisBackground=[];
    const storedBefore=(await db.classroomConnection.findUnique({where:{id:`${sid}:student:redis-client`}})).lastSeenAt;
    const versionBefore=(await db.classroomRedisSync.findUnique({where:{sessionId:sid}})).version;
    let rawReads=0;db.$queryRaw=()=>{rawReads++;throw Object.assign(new Error('simulated PG unavailable'),{code:'P1001'});};
    const heartbeats=await Promise.all(Array.from({length:80},()=>api.heartbeat(request(),ctx)));
    assert.ok(heartbeats.every(response=>response.status===200));assert.equal(rawReads,0);assert.equal(globalThis.redisAccessReads,0);
    assert.equal(await api.redisClassroomHeartbeat(sid,'other-user','redis-client'),null);
    globalThis.redisActor=null;assert.equal((await api.heartbeat(request(),ctx)).status,401);globalThis.redisActor=student;
    db.$queryRaw=originalRaw;
    assert.equal((await db.classroomConnection.findUnique({where:{id:`${sid}:student:redis-client`}})).lastSeenAt.getTime(),storedBefore.getTime());
    pass('80 authenticated registered heartbeats succeed without PG reads or writes; unknown identity cannot reuse a lease');

    const beforeMember=await db.classroomMemberState.findUnique({where:{sessionId_userId:{sessionId:sid,userId:'student'}}});
    assert.equal(await api.flushClassroomRedisPresence(sid),true);
    const afterMember=await db.classroomMemberState.findUnique({where:{sessionId_userId:{sessionId:sid,userId:'student'}}});
    assert.ok(afterMember.lastSeenAt>=beforeMember.lastSeenAt);assert.equal(afterMember.microphoneAllowed,beforeMember.microphoneAllowed);assert.equal(afterMember.onStage,beforeMember.onStage);
    assert.equal((await db.classroomRedisSync.findUnique({where:{sessionId:sid}})).version,versionBefore);
    assert.equal(await cmd(['HLEN',key('dirty-presence')]),0);
    pass('batch checkpoint persists presence while preserving permissions and avoiding business outbox churn');

    lock=await pool.connect();await lock.query('BEGIN');await lock.query('SELECT "id" FROM "ClassroomConnection" WHERE "id"=$1 FOR UPDATE',[`${sid}:student:redis-client`]);
    await api.redisClassroomHeartbeat(sid,'student','redis-client');const start=Date.now();assert.equal(await api.flushClassroomRedisPresence(sid),true);
    assert.ok(Date.now()-start<1000);assert.equal(await cmd(['HLEN',key('dirty-presence')]),1);
    await lock.query('ROLLBACK');lock.release();lock=null;await api.flushClassroomRedisPresence(sid);assert.equal(await cmd(['HLEN',key('dirty-presence')]),0);
    pass('locked PG row is skipped promptly and its dirty heartbeat remains retryable');

    await api.redisClassroomHeartbeat(sid,'student','redis-client');db.$queryRaw=()=>{throw Object.assign(new Error('checkpoint PG failure'),{code:'P1001'});};
    assert.equal(await api.flushClassroomRedisPresence(sid),false);assert.equal(await cmd(['HLEN',key('dirty-presence')]),1);db.$queryRaw=originalRaw;
    assert.equal(await api.flushClassroomRedisPresence(sid),true);assert.equal(await cmd(['HLEN',key('dirty-presence')]),0);
    pass('failed PG checkpoint is retained and succeeds on retry');

    await api.redisClassroomHeartbeat(sid,'student','redis-client');
    let checkpointRead,releaseCheckpoint;const checkpointReadPromise=new Promise(r=>checkpointRead=r),checkpointGate=new Promise(r=>releaseCheckpoint=r);
    db.$queryRaw=async (...args)=>{const rows=await originalRaw.apply(db,args);checkpointRead();await checkpointGate;return rows;};
    const flushing=api.flushClassroomRedisPresence(sid);await checkpointReadPromise;await sleep(5);await api.redisClassroomHeartbeat(sid,'student','redis-client');
    releaseCheckpoint();assert.equal(await flushing,true);db.$queryRaw=originalRaw;assert.equal(await cmd(['HLEN',key('dirty-presence')]),1);
    await api.flushClassroomRedisPresence(sid);assert.equal(await cmd(['HLEN',key('dirty-presence')]),0);
    pass('a newer heartbeat arriving during a checkpoint is not removed by the older acknowledgment');

    let loads=0;const read=async()=>{loads++;await sleep(80);return {value:'shared'};};
    const results=await Promise.all([api.classroomSharedRead(sid,'shared-test',read),other.classroomSharedRead(sid,'shared-test',read)]);
    assert.deepEqual(results,[{value:'shared'},{value:'shared'}]);assert.equal(loads,1);
    assert.deepEqual(await api.classroomSharedRead(sid,'courseware:teacher',async()=>['teacher-secret']),['teacher-secret']);
    assert.deepEqual(await other.classroomSharedRead(sid,'courseware:student',async()=>['student-public']),['student-public']);
    pass('independent server instances share a cache fill and isolate teacher/student cache scopes');

    let unblock,started;const startedPromise=new Promise(r=>started=r),gate=new Promise(r=>unblock=r);
    const late=api.classroomSharedRead(sid,'race',async()=>{started();await gate;return 'old';});await startedPromise;
    await db.classroomRuntime.update({where:{sessionId:sid},data:{chatEnabled:false,revision:{increment:1}}});await api.synchronizeClassroomRedis(sid,true);unblock();assert.equal(await late,'old');
    assert.equal(await other.classroomSharedRead(sid,'race',async()=>'new'),'new');
    pass('a cache fill finishing after a PG mutation cannot publish under the new revision');

    const v=(await db.classroomRedisSync.findUnique({where:{sessionId:sid}})).version;
    await assert.rejects(db.$transaction(async tx=>{await tx.classroomRuntime.update({where:{sessionId:sid},data:{chatEnabled:true,revision:{increment:1}}});throw new Error('rollback');}));
    assert.equal((await db.classroomRedisSync.findUnique({where:{sessionId:sid}})).version,v);
    pass('rolled back PG business changes do not enter the Redis synchronization outbox');

    let sourceRead,releaseSource,firstSource=true;const sourceReadPromise=new Promise(r=>sourceRead=r),sourceGate=new Promise(r=>releaseSource=r);
    db.$queryRaw=async (...args)=>{const rows=await originalRaw.apply(db,args);if(firstSource){firstSource=false;sourceRead();await sourceGate;}return rows;};
    const oldSync=api.synchronizeClassroomRedis(sid);await sourceReadPromise;
    await db.classroomRuntime.update({where:{sessionId:sid},data:{stageLocked:true,revision:{increment:1}}});const newSync=api.synchronizeClassroomRedis(sid,true);
    releaseSource();await Promise.all([oldSync,newSync]);db.$queryRaw=originalRaw;
    const newest=await db.classroomRedisSync.findUnique({where:{sessionId:sid}});assert.ok(newest.processedAt);
    assert.equal(JSON.parse(await cmd(['GET',key('control')])).version,newest.version.toString().padStart(20,'0'));
    pass('post-commit synchronization does not reuse a pre-commit source or acknowledge a newer queued revision');

    await db.classroomRuntime.update({where:{sessionId:sid},data:{stageStudentLimit:6}});
    for(let i=2;i<=6;i++){await api.touchClassroomMember(course.id,{...student,userId:`student-${i}`,name:`student-${i}`},'student',undefined,sid);await api.touchClassroomConnection(sid,`student-${i}`,`redis-client-${i}`,true);}
    await db.classroomConnection.updateMany({where:{sessionId:sid,leftAt:null},data:{lastSeenAt:new Date(Date.now()-121000)}});
    await db.classroomMemberState.updateMany({where:{sessionId:sid},data:{lastSeenAt:new Date(Date.now()-121000)}});
    await api.applyClassroomAction({courseId:course.id,sessionId:sid,session:teacher,role:'teacher',action:{type:'startRandomSelector'}});
    assert.ok((await db.classroomEngagementRound.findFirst({where:{sessionId:sid,kind:'selector'},orderBy:{createdAt:'desc'}})).winnerUserId.startsWith('student'));
    const gallery=await api.applyClassroomAction({courseId:course.id,sessionId:sid,session:teacher,role:'teacher',action:{type:'arrangeVideoGallery'}});
    assert.equal(gallery.composition.seatOrder.filter(id=>id.startsWith('student')).length,6);
    pass('random selection and video arrangement use fresh Redis presence despite stale PG member timestamps');

    await db.classroomConnection.update({where:{id:`${sid}:student-6:redis-client-6`},data:{leftAt:new Date()}});
    const closedGallery=await api.applyClassroomAction({courseId:course.id,sessionId:sid,session:teacher,role:'teacher',action:{type:'arrangeVideoGallery'}});
    assert.ok(!closedGallery.composition.seatOrder.includes('student-6'));
    await api.touchClassroomConnection(sid,'student-6','redis-client-6',true);
    pass('online actions exclude a PG-closed tab even before its old Redis lease has been synchronized');
    const waiting=await api.touchClassroomMember(course.id,{...student,userId:'seventh',name:'seventh'},'student',undefined,sid);assert.equal(waiting.onStage,false);
    const snap=await api.getClassroomRuntimeSnapshot(course.id,sid,{ensure:false,coalesce:true});assert.equal(snap.members.find(m=>m.userId==='student').connectionStatus,'online');
    pass('fresh Redis leases preserve six stage seats even when the PG checkpoint is older than two minutes');

    const lease=JSON.parse(await cmd(['HGET',key('connections'),`${sid}:student:redis-client`]));lease.lastSeenAt=Date.now()-90000;
    await cmd(['HSET',key('connections'),lease.id,JSON.stringify(lease)]);
    const reconnect=await api.getClassroomRuntimeSnapshot(course.id,sid,{ensure:false,coalesce:true});const member=reconnect.members.find(m=>m.userId==='student');
    assert.equal(member.connectionStatus,'reconnecting');assert.equal(member.onStage,true);assert.equal(member.rtcUids.length,1);
    pass('a short outage renders reconnecting and retains the stage seat and RTC identity');

    await api.leaveClassroomConnection(sid,'student','redis-client',true);const closed=await api.heartbeat(request(),ctx);assert.equal(closed.status,409);
    assert.equal((await api.getClassroomRuntimeSnapshot(course.id,sid,{ensure:false})).members.find(m=>m.userId==='student').onStage,false);
    await api.flushClassroomRedisPresence(sid);assert.equal(await cmd(['HLEN',key('dirty-presence')]),0);
    await api.touchClassroomConnection(sid,'student','redis-client',true);
    await db.classroomRuntime.update({where:{sessionId:sid},data:{status:'ended'}});await api.synchronizeClassroomRedis(sid,true);
    assert.equal((await api.heartbeat(request(),ctx)).status,409);await db.classroomRuntime.update({where:{sessionId:sid},data:{status:'live'}});await api.synchronizeClassroomRedis(sid,true);
    pass('explicit leave and classroom end reject delayed heartbeats; closed checkpoints are discarded');

    const goodUrl=process.env.CLASSROOM_REDIS_URL;
    const savedTimeout=process.env.CLASSROOM_REDIS_TIMEOUT_MS;process.env.CLASSROOM_REDIS_TIMEOUT_MS='100';
    await cmd(['CLIENT','PAUSE','1500','ALL']);
    await db.classroomRuntime.update({where:{sessionId:sid},data:{chatEnabled:true,revision:{increment:1}}});assert.equal(await api.synchronizeClassroomRedis(sid,true),false);
    const pending=await db.classroomRedisSync.findUnique({where:{sessionId:sid}});assert.equal(pending.processedAt,null);
    globalThis.redisAccessReads=0;
    const fallback=await api.heartbeat(request(),ctx);assert.equal(fallback.status,503);assert.equal(globalThis.redisAccessReads,0);
    let cacheFallback=false;
    await assert.rejects(api.classroomSharedRead(sid,'redis-down',async()=>{cacheFallback=true;return ['pg-roster'];}),{code:'CLASSROOM_CACHE_UNAVAILABLE'});
    assert.equal(cacheFallback,false);
    assert.equal(api.classroomRedisDiagnostics().circuitOpen,true);
    pass('real Redis outage returns retryable errors without per-student PG reads; business synchronization remains pending');

    await sleep(1600);await api.closeClassroomRedis();
    for(let i=0;i<20;i++){if(await cmd(['PING'])==='PONG')break;await api.closeClassroomRedis();await sleep(100);}
    await db.classroomRedisSync.update({where:{sessionId:sid},data:{nextAttemptAt:new Date(0)}});
    await api.drainClassroomRedisSync();assert.ok((await db.classroomRedisSync.findUnique({where:{sessionId:sid}})).processedAt);
    assert.equal((await api.heartbeat(request(),ctx)).status,200);
    pass('cron retries committed PG synchronization and rebuilds leases after Redis recovers');

    const control=JSON.parse(await cmd(['GET',key('control')]));control.verifiedUntil=Date.now()-1;await cmd(['SET',key('control'),JSON.stringify(control),'EX','60']);
    globalThis.redisAccessReads=0;assert.equal((await api.heartbeat(request(),ctx)).status,503);assert.equal(globalThis.redisAccessReads,0);
    await Promise.all(globalThis.redisBackground.splice(0).map(callback=>callback()));
    assert.equal((await api.heartbeat(request(),ctx)).status,200);
    pass('expired Redis control queues elected room recovery before accepting further heartbeats');

    await api.closeClassroomRedis();process.env.CLASSROOM_REDIS_URL='';process.env.REDIS_URL='';assert.equal(api.classroomRedisEnabled(),false);
    const plain=await api.touchClassroomConnection(sid,'student','redis-client');assert.equal(plain.refreshed,true);assert.equal(await api.classroomSharedRead(sid,'disabled',async()=>'PG'),'PG');process.env.CLASSROOM_REDIS_URL=goodUrl;
    pass('unset Redis configuration preserves the existing PG path');

    await cmd(['CLIENT','PAUSE','1000','ALL']);const timeoutStart=Date.now();assert.equal(await cmd(['SET',key('timeout-test'),'value','PX','1000']),undefined);
    assert.ok(Date.now()-timeoutStart<800);assert.equal(api.classroomRedisDiagnostics().circuitOpen,false);
    assert.equal(await cmd(['PING']),undefined);assert.equal(await cmd(['PING']),undefined);assert.equal(api.classroomRedisDiagnostics().circuitOpen,true);await sleep(1100);await api.closeClassroomRedis();
    assert.equal(await cmd(['PING']),'PONG');
    if(savedTimeout===undefined)delete process.env.CLASSROOM_REDIS_TIMEOUT_MS;else process.env.CLASSROOM_REDIS_TIMEOUT_MS=savedTimeout;
    pass('isolated timeout preserves the shared connection; repeated timeouts open a bounded circuit and recover');

    let active=0,maxActive=0;const fallbacks=await Promise.allSettled(Array.from({length:16},(_,i)=>api.classroomPgFallback(`limit-${i}`,async()=>{
      active++;maxActive=Math.max(maxActive,active);await sleep(120);active--;return 'PG';
    })));
    assert.equal(maxActive,2);assert.ok(fallbacks.some(r=>r.status==='rejected'&&r.reason.code==='CLASSROOM_CACHE_UNAVAILABLE'));
    assert.ok(fallbacks.filter(r=>r.status==='fulfilled').every(r=>r.value==='PG'));
    pass('PG fallback concurrency stays at two and queue exhaustion produces a retryable error');
    console.log(`PASS ${passed} Redis/PG integration scenarios with PG pool max=3`);
  } finally {
    db.$queryRaw=originalRaw;db.$transaction=originalTransaction;
    if(lock){await lock.query('ROLLBACK');lock.release();}
    await api.closeClassroomRedis();await db.$disconnect();await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
