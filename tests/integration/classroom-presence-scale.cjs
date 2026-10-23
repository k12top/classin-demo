/* eslint-disable @typescript-eslint/no-require-imports -- Disposable loopback PostgreSQL/Redis acceptance. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),http=require('node:http'),{fork}=require('node:child_process'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..');
function isolated(){
 for(const [key,port] of [['DATABASE_URL','55439'],['CLASSROOM_REDIS_URL','56389']]){const u=new URL(process.env[key]||'http://invalid');assert.ok(u.hostname==='127.0.0.1'&&u.port===port,`${key} must use the dedicated loopback port`);}
 assert.ok(['/classroom_recovery_scale','/classroom_recovery_scale_clean'].includes(new URL(process.env.DATABASE_URL).pathname));
 assert.ok(process.env.CLASSROOM_REDIS_PREFIX?.startsWith('isolated-presence-scale:'));
}
isolated();
const bundle=path.join(root,'node_modules/.cache/presence-scale.cjs');
async function build(){await fs.mkdir(path.dirname(bundle),{recursive:true});
 const stubs={
 'server-only':'',
 '@/lib/db':`const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');export const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL,max:8,connectionTimeoutMillis:3000}),log:[{level:'query',emit:'event'}]});prisma.$on('query',e=>{globalThis.scaleSql.total++;if(e.query.includes('jsonb_agg'))globalThis.scaleSql.fullRoster++;if(e.query.includes('UPDATE "ClassroomConnection"'))globalThis.scaleSql.checkpoints++;});export const databasePoolSnapshot=()=>null;export const isTransientDatabaseError=e=>["P2024","P2028","ECONNREFUSED","40P01"].includes(e?.code);`,
 '@/lib/session':`export async function getSessionFromRequest(request){const userId=request.headers.get('x-test-user');return userId?{userId,name:userId,displayName:userId}:null;}`,
 '@/lib/classroom/server/request-access':`export async function resolveClassroomRequestAccess(request,id){const userId=request.headers.get('x-test-user');return userId?{ok:true,session:{userId,name:userId,displayName:userId},access:{courseId:request.headers.get('x-test-course'),sessionId:id,role:'student'}}:{ok:false,status:401,error:'Unauthorized'};}`,
 '@/lib/classroom/server/integration-events':'export const enqueueClassroomEvent=async()=>{};export const deliverClassroomEvents=async()=>{};',
 '@/lib/classroom/translation/wordly':'export const isWordlyConfigured=()=>false;export const isWordlyHealthy=async()=>false;export const stopWordlyRoom=async()=>{};export const ensureWordlyRoom=async()=>{};export const translateCaptionWithWordly=async(_,caption)=>caption;',
 'next/server':`export const after=callback=>globalThis.scaleJobs.push(callback);export const NextResponse=Response;export class NextRequest extends Request{get nextUrl(){return new URL(this.url)}};`,
 };
 await esbuild.build({stdin:{resolveDir:root,contents:`export {prisma} from '@/lib/db';export {touchClassroomConnection} from '@/lib/classroom/server/connections';export * from '@/lib/classroom/server/redis';export * from '@/lib/classroom/server/redis-sync';export * from '@/lib/classroom/server/redis-presence';export * from '@/lib/classroom/server/shared-cache';export * from '@/lib/classroom/server/empty-room';export {POST as heartbeat} from '@/app/api/courses/[id]/classroom/actions/route';export {GET as state} from '@/app/api/courses/[id]/classroom/state/route';export {ingestClassroomCaption} from '@/lib/classroom/server/captions';`},outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'isolated-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}));}}]});
}
async function worker(){globalThis.scaleSql={total:0,fullRoster:0,checkpoints:0};globalThis.scaleJobs=[];const api=require(bundle);
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1');if(u.pathname==='/metrics'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...globalThis.scaleSql,jobs:scaleJobs.length}));}if(u.pathname==='/reset'){globalThis.scaleSql={total:0,fullRoster:0,checkpoints:0};return res.end('OK');}
  if(u.pathname==='/jobs'){const jobs=scaleJobs.splice(0);await Promise.all(jobs.map(cb=>cb()));return res.end('OK');}
  if(u.pathname==='/close'){await api.closeClassroomRedis();return res.end('OK');}
  const data=await new Promise(resolve=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>resolve(body));});
  const request=new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:{...req.headers,'content-type':'application/json'},...(req.method==='POST'?{body:data}: {})});
  Object.defineProperty(request,'nextUrl',{value:new URL(request.url)});
  const ctx={params:Promise.resolve({id:u.searchParams.get('session')})};const result=req.method==='POST'?await api.heartbeat(request,ctx):await api.state(request,ctx);
  res.statusCode=result.status;res.setHeader('Content-Type','application/json');res.end(await result.text());
 }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));process.send({port:server.address().port});
 process.on('message',async m=>{if(m==='stop'){server.close();await api.closeClassroomRedis();await api.prisma.$disconnect();process.exit(0);}});
}
async function main(){await build();globalThis.scaleSql={total:0,fullRoster:0,checkpoints:0};globalThis.scaleJobs=[];const api=require(bundle),db=api.prisma;
 const redis=require('redis').createClient({url:process.env.CLASSROOM_REDIS_URL});await redis.connect();
 const children=[],ports=[],results=[];let course,admission,sustainedOutage;
 const key=(id,suffix)=>api.classroomRedisKey(id,suffix);
 const endpoint=(index,p)=>`http://127.0.0.1:${ports[index%ports.length]}${p}`;
 const stats=async()=>Promise.all(ports.map((_,i)=>fetch(endpoint(i,'/metrics')).then(r=>r.json())));
 const reset=async()=>Promise.all(ports.map((_,i)=>fetch(endpoint(i,'/reset'))));
 const jobs=async()=>Promise.all(ports.map((_,i)=>fetch(endpoint(i,'/jobs'))));
 const run=async(count,fn,concurrency=100)=>{const latencies=[],statuses={};let next=0;await Promise.all(Array.from({length:Math.min(count,concurrency)},async()=>{while(next<count){const i=next++,t=performance.now(),res=await fn(i);latencies.push(performance.now()-t);statuses[res.status]=(statuses[res.status]||0)+1;const text=await res.text();if(res.status===500 && statuses[500]<3)console.error('HTTP500',text);}}));latencies.sort((a,b)=>a-b);return {requests:count,statuses,p95:Math.round(latencies[Math.floor(latencies.length*.95)]),p99:Math.round(latencies[Math.floor(latencies.length*.99)])};};
 const leaseBody=i=>JSON.stringify({clientId:`scale-client-${i}`,action:{type:'heartbeat'},presenceOnly:true});
 const headers=i=>({'x-test-user':`student-${i}`,'x-test-course':course.id,'content-type':'application/json'});
 try{
  for(let i=0;i<4;i++){const child=fork(__filename,['worker'],{env:process.env,stdio:['ignore','pipe','pipe','ipc']});children.push(child);child.stderr.on('data',chunk=>{if(process.env.VERBOSE)process.stderr.write(chunk)});ports.push(await new Promise((resolve,reject)=>{child.once('message',m=>resolve(m.port));child.once('exit',code=>reject(Error(`worker exit ${code}`)));}));}
  course=await db.course.create({data:{name:'Isolated presence scalability',ownerId:'teacher',ownerName:'Teacher',teacherId:'teacher',teacherName:'Teacher'}});
  for(const count of [100,500,1000]){
   const lesson=await db.courseSession.create({data:{courseId:course.id,position:count,roomUuid:crypto.randomUUID(),roomType:2,status:'live',title:`Scale ${count}`,createdBy:'teacher',startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+3600000)}});
   const room=await db.classroomRuntime.create({data:{sessionId:lesson.id,courseId:course.id,status:'live',startedAt:new Date(),composition:{}}});
   await db.classroomMemberState.createMany({data:Array.from({length:count},(_,i)=>({runtimeId:room.id,courseId:course.id,sessionId:lesson.id,userId:`student-${i}`,displayName:`Student ${i}`,role:'student',presence:'online'}))});
   await db.classroomConnection.createMany({data:Array.from({length:count},(_,i)=>({id:`${lesson.id}:student-${i}:scale-client-${i}`,sessionId:lesson.id,userId:`student-${i}`,rtcUid:i+1,screenUid:count+i+1}))});
   if(count===100){
    globalThis.scaleSql={total:0,fullRoster:0,checkpoints:0};
    admission=await run(100,async i=>{await api.touchClassroomConnection(lesson.id,`student-${i}`,`scale-client-${i}`,true);return new Response();},20);
    assert.equal(admission.statuses[200],100);assert.equal(globalThis.scaleSql.fullRoster,0,'registration must not scan the full classroom');
    admission={...admission,concurrency:20,fullRosterScans:0};
   }
   assert.equal(await api.synchronizeClassroomRedis(lesson.id,true),true);await reset();
   const hb=await run(count*3,i=>fetch(endpoint(i,`/heartbeat?session=${lesson.id}`),{method:'POST',headers:headers(i%count),body:leaseBody(i%count)}));
   assert.equal(hb.statuses[200],count*3);const beforeJobs=await stats();assert.equal(beforeJobs.reduce((s,x)=>s+x.total,0),0,'healthy HTTP heartbeats must not touch PG');
   await jobs();let dirty=await redis.hLen(key(lesson.id,'dirty-presence'));while(dirty){assert.equal(await api.flushClassroomRedisPresence(lesson.id),true);dirty=await redis.hLen(key(lesson.id,'dirty-presence'));}
   const sqlBeforeState=(await stats()).reduce((s,x)=>s+x.total,0);
   const stateLoad=await run(40,i=>fetch(endpoint(i,`/state?session=${lesson.id}&scope=runtime`),{headers:headers(i%count)}),20);assert.equal(stateLoad.statuses[200],40);
   const stateSql=(await stats()).reduce((s,x)=>s+x.total,0)-sqlBeforeState;
   // Subtitle invalidation must not touch the room control version or runtime scope.
   const old=await db.classroomRedisSync.findUnique({where:{sessionId:lesson.id}});await db.classroomCaption.create({data:{courseId:course.id,sessionId:lesson.id,runtimeId:room.id,externalId:crypto.randomUUID(),speakerId:'teacher',speakerName:'Teacher',text:'Test subtitle',sourceLanguage:'zh-CN',isFinal:true}});
   const after=await db.classroomRedisSync.findUnique({where:{sessionId:lesson.id}});assert.equal(after.version,old.version);assert.ok(await db.classroomCacheVersion.findUnique({where:{sessionId_topic:{sessionId:lesson.id,topic:'captions'}}}));
   if(count===1000){
    await db.classroomConnection.updateMany({where:{sessionId:lesson.id},data:{lastSeenAt:new Date(Date.now()-600000)}});
    await redis.del([key(lesson.id,'dirty-presence'),key(lesson.id,'dirty-order')]);
    await run(count,i=>fetch(endpoint(i,`/heartbeat?session=${lesson.id}`),{method:'POST',headers:headers(i),body:leaseBody(i)}));
    await api.flushClassroomRedisPresence(lesson.id);
    // A new round must not push the uncheckpointed half behind the already written half.
    await run(count,i=>fetch(endpoint(i,`/heartbeat?session=${lesson.id}`),{method:'POST',headers:headers(i),body:leaseBody(i)}));
    await api.flushClassroomRedisPresence(lesson.id);
    assert.equal(await db.classroomConnection.count({where:{sessionId:lesson.id,lastSeenAt:{gt:new Date(Date.now()-30000)}}}),count,'checkpoint batches must rotate fairly under continuous renewal');
   }
   // Stale durable checkpoint is not proof of an empty room while Redis leases are fresh.
   await db.classroomConnection.updateMany({where:{sessionId:lesson.id},data:{lastSeenAt:new Date(Date.now()-600000)}});
   assert.equal(await api.claimRedisEmptyClassroom(lesson.id,'active-fence',180000),false);
   // A missing control produces one distributed room rebuild, not N synchronizations.
   await redis.del(key(lesson.id,'control'));await reset();const misses=await run(count,i=>fetch(endpoint(i,`/heartbeat?session=${lesson.id}`),{method:'POST',headers:headers(i),body:leaseBody(i)}));assert.equal(misses.statuses[503],count);
   await jobs();const recovery=await stats();assert.equal(recovery.reduce((s,x)=>s+x.fullRoster,0),1,'four instances elect one roster recovery');
   // Old dirty checkpoints cannot reopen an explicitly closed connection.
   await db.classroomConnection.update({where:{id:`${lesson.id}:student-0:scale-client-0`},data:{leftAt:new Date()}});await api.synchronizeClassroomRedis(lesson.id,true);
   assert.equal((await api.redisClassroomHeartbeat(lesson.id,'student-0','scale-client-0')).reason,'left');await api.flushClassroomRedisPresence(lesson.id);assert.ok((await db.classroomConnection.findUnique({where:{id:`${lesson.id}:student-0:scale-client-0`}})).leftAt);
   // Real Redis server-side command timeout; cache outage must generate zero fallback SQL.
   await Promise.all(ports.map((_,i)=>fetch(endpoint(i,'/close'))));await reset();await redis.sendCommand(['CLIENT','PAUSE','1500','ALL']);
   const outage=await run(count,i=>fetch(endpoint(i,`/heartbeat?session=${lesson.id}`),{method:'POST',headers:headers(i),body:leaseBody(i)}));assert.equal(outage.statuses[503],count);await jobs();const outageState=await run(40,i=>fetch(endpoint(i,`/state?session=${lesson.id}&scope=runtime`),{headers:headers(i%count)}));assert.equal(outageState.statuses[503],40);
   globalThis.scaleSql={total:0,fullRoster:0,checkpoints:0};assert.equal(await api.closeEmptyClassrooms([course.id]),0);assert.equal(globalThis.scaleSql.total,0,'cache outage must suspend automatic close without PG scans');
   const outageSql=(await stats()).reduce((s,x)=>s+x.total,0);assert.equal(outageSql,0);
   await new Promise(resolve=>setTimeout(resolve,10_100));
   const restored=await run(20,i=>fetch(endpoint(i,`/heartbeat?session=${lesson.id}`),{method:"POST",headers:headers(i+1),body:leaseBody(i+1)}));assert.equal(restored.statuses[200],20);
   results.push({connections:count,instances:4,heartbeat:hb,state:stateLoad,stateSql,healthyHeartbeatSql:0,recoveryFullScans:1,outage:outage,outageSql});
   console.log(JSON.stringify(results.at(-1)));
  }
  // A valid empty-close fence excludes renewal; explicit terminal state cannot be revived.
  const empty=await db.courseSession.create({data:{courseId:course.id,position:9000,roomUuid:crypto.randomUUID(),roomType:2,status:'live',title:'Empty fence',createdBy:'teacher',startTime:new Date(Date.now()-600000),endTime:new Date(Date.now()+3600000)}});
  const emptyRuntime=await db.classroomRuntime.create({data:{sessionId:empty.id,courseId:course.id,status:'live',startedAt:new Date(Date.now()-600000)}});
  await db.classroomMemberState.create({data:{runtimeId:emptyRuntime.id,courseId:course.id,sessionId:empty.id,userId:'teacher',role:'teacher',displayName:'Teacher'}});
  await db.classroomConnection.create({data:{id:`${empty.id}:teacher:empty-client`,sessionId:empty.id,userId:'teacher',rtcUid:1,screenUid:2,lastSeenAt:new Date(Date.now()-600000)}});
  await api.synchronizeClassroomRedis(empty.id,true);
  assert.equal(await api.claimRedisEmptyClassroom(empty.id,'fence-test',180000),true);
  assert.equal((await api.redisClassroomHeartbeat(empty.id,'teacher','empty-client')).reason,'busy');
  assert.equal(await api.refreshClassroomRedisControl(empty.id),false,'background refresh cannot erase a close fence');
  await api.releaseRedisEmptyClassroom(empty.id,'fence-test',false);
  assert.equal((await api.redisClassroomHeartbeat(empty.id,'teacher','empty-client')).refreshed,true);
  await db.classroomRuntime.update({where:{sessionId:empty.id},data:{status:'ended'}});await api.refreshClassroomRedisControl(empty.id);
  assert.equal((await api.redisClassroomHeartbeat(empty.id,'teacher','empty-client')).reason,'ended');
  // Caption/runtime transaction lock pressure runs on the same migrated disposable PG.
  const id=(await db.courseSession.findFirst({where:{courseId:course.id}})).id;
  // A delayed source with the same control version must not roll topic versions back.
  const originalRaw=db.$queryRaw;let first=true,sourceRead,releaseSource;
  const sourceReady=new Promise(resolve=>sourceRead=resolve),sourceGate=new Promise(resolve=>releaseSource=resolve);
  db.$queryRaw=async(...args)=>{const rows=await originalRaw.apply(db,args);if(first){first=false;sourceRead();await sourceGate;}return rows;};
  const delayed=api.synchronizeClassroomRedis(id);await sourceReady;
  const runtime=await db.classroomRuntime.findUnique({where:{sessionId:id}});
  await db.classroomCaption.create({data:{courseId:course.id,sessionId:id,runtimeId:runtime.id,externalId:crypto.randomUUID(),speakerId:'teacher',speakerName:'Teacher',text:'Version race',sourceLanguage:'zh-CN',isFinal:true}});
  await api.refreshClassroomRedisControl(id);const current=JSON.parse(await redis.get(key(id,'control'))).versions.captions;
  releaseSource();await delayed;db.$queryRaw=originalRaw;
  assert.equal(JSON.parse(await redis.get(key(id,'control'))).versions.captions,current);
  const expired=JSON.parse(await redis.get(key(id,'control')));expired.verifiedUntil=Date.now()-1;await redis.set(key(id,'control'),JSON.stringify(expired));
  let loaded=false;await assert.rejects(api.classroomSharedRead(id,'expired-test',async()=>{loaded=true;return [];}),{code:'P2024'});assert.equal(loaded,false);
  await api.refreshClassroomRedisControl(id);
  // Locked checkpoint rows stay dirty and can be retried without blocking other batches.
  const {Pool}=require('pg'),pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
  const locked=await pool.connect();
  try{
   await redis.del([key(id,'dirty-presence'),key(id,'dirty-order')]);
   await api.redisClassroomHeartbeat(id,'student-1','scale-client-1');await locked.query('BEGIN');
   await locked.query('SELECT id FROM "ClassroomConnection" WHERE id=$1 FOR UPDATE',[`${id}:student-1:scale-client-1`]);
   const start=Date.now();assert.equal(await api.flushClassroomRedisPresence(id),true);assert.ok(Date.now()-start<1000);
   assert.equal(await redis.hLen(key(id,'dirty-presence')),1);await locked.query('ROLLBACK');
   assert.equal(await api.flushClassroomRedisPresence(id),true);assert.equal(await redis.hLen(key(id,'dirty-presence')),0);
  }finally{await locked.query('ROLLBACK');locked.release();await pool.end();}
  await Promise.all([ ...Array.from({length:20},(_,i)=>api.ingestClassroomCaption(course.id,{id:`concurrent-${i}`,speakerId:'teacher',speakerName:'Teacher',text:`Caption ${i}`,sourceLanguage:'zh-CN',detectedLanguage:'zh-CN',occurredAt:new Date().toISOString(),provider:'shengwang',isFinal:true,translations:{}},id)), ...Array.from({length:20},()=>db.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "ClassroomRuntime" WHERE "sessionId"=${id} FOR UPDATE`;await tx.classroomRuntime.update({where:{sessionId:id},data:{chatEnabled:false}});},{maxWait:5000,timeout:5000})) ]);
  if(process.env.SUSTAINED_OUTAGE_MS){
   assert.equal(process.env.SUSTAINED_OUTAGE_MS,'120000','only the reviewed 120s isolated outage is allowed');
   const longRoom=await db.courseSession.findFirst({where:{courseId:course.id,position:1000}});
   await api.synchronizeClassroomRedis(longRoom.id,true);await jobs();await reset();
   await Promise.all(ports.map((_,i)=>fetch(endpoint(i,'/close'))));await api.closeClassroomRedis();
   globalThis.scaleSql={total:0,fullRoster:0,checkpoints:0};
   await redis.sendCommand(['CLIENT','PAUSE','120000','ALL']);const started=Date.now(),probes=[];
   for(const delay of [0,30000,60000,90000,118000]){
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,started+delay-Date.now())));
    const heartbeat=await run(1000,i=>fetch(endpoint(i,`/heartbeat?session=${longRoom.id}`),{method:'POST',headers:headers(i),body:leaseBody(i)}));
    assert.equal(heartbeat.statuses[503],1000);await jobs();
    const state=await run(40,i=>fetch(endpoint(i,`/state?session=${longRoom.id}&scope=runtime`),{headers:headers(i)}));assert.equal(state.statuses[503],40);
    assert.equal(await api.closeEmptyClassrooms([course.id]),0);assert.equal(globalThis.scaleSql.total,0);
    assert.equal((await stats()).reduce((s,x)=>s+x.total,0),0);
    probes.push({elapsedMs:Date.now()-started,heartbeat,state,fallbackSql:0});console.log(`PASS sustained Redis outage probe at ${Math.round((Date.now()-started)/1000)}s; no PG fallback or automatic close`);
   }
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,started+131000-Date.now())));
   const expiredRecovery=await run(1000,i=>fetch(endpoint(i,`/heartbeat?session=${longRoom.id}`),{method:'POST',headers:headers(i),body:leaseBody(i)}));assert.equal(expiredRecovery.statuses[503],1000);
   await jobs();assert.equal((await stats()).reduce((s,x)=>s+x.fullRoster,0),1,'expired control after long outage elects exactly one recovery');
   const restored=await run(20,i=>fetch(endpoint(i,`/heartbeat?session=${longRoom.id}`),{method:'POST',headers:headers(i+1),body:leaseBody(i+1)}));assert.equal(restored.statuses[200],20);
   sustainedOutage={pauseMs:120000,probes,recoveryFullScans:1,restored};
  }
  const output=path.join(root,'outputs/classroom-presence-scale');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'results.json'),JSON.stringify({database:'disposable loopback PostgreSQL 16',cache:'disposable loopback Redis 8.8',boundaries:'Actual HTTP heartbeat/state routes and Redis/PG; max 100 simultaneous HTTP requests; session identity and external media/webhook providers are stubbed. Admission reuses already-authorized members. No RTC or production capacity claim.',admission,results,sustainedOutage,correctness:['fair 500-row checkpoint batches under continuous renewal','fresh Redis leases prevent false empty close','Redis outage suspends automatic close before PG','explicit leave survives dirty checkpoint','close fence excludes renewal and background control refresh','ended classroom rejects heartbeat','late control refresh cannot roll back topic versions','expired control does not cause PG read fallback','locked checkpoint row stays dirty until retry','20 concurrent caption ingestions plus 20 moderator transactions without deadlock']},null,2));console.log('PASS isolated multi-instance HTTP/Redis/PG scaling and fault acceptance');
 }finally{for(const child of children)child.send('stop');await redis.quit();if(course)await db.course.delete({where:{id:course.id}});await api.closeClassroomRedis();await db.$disconnect();}
}
if(process.argv[2]==='worker')worker().catch(e=>{console.error(e);process.exit(1)});else main().catch(e=>{console.error(e);process.exitCode=1;});
