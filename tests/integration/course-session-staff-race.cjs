/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS integration harness */
// Run against the disposable local workspace database, with DATABASE_URL set.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const database = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '::1'].includes(database.hostname) || database.pathname !== '/classin_unified_dev') {
  throw new Error('This integration test requires the local classin_unified_dev database');
}
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
let api, courseId, dir;
(async () => {
  dir = await fs.mkdtemp(path.join(root, 'node_modules/.staff-race-'));
  const stubs = {
    '@/lib/session': 'export async function getSessionFromRequest(){return {userId:"race-owner",name:"race-owner",role:"teacher"}}',
    '@/lib/user-directory': 'export async function listDirectoryUsers(){return [{id:"race-staff",name:"Staff",displayName:"Staff",avatar:"",casdoorUuid:null}]}'
  };
  const file = path.join(dir, 'route.cjs');
  await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db"; export {NextRequest} from "next/server"; export {PATCH} from "@/app/api/courses/[id]/sessions/[sessionId]/route"; export {POST,GET as staffGet} from "@/app/api/courses/[id]/sessions/staff/route";',resolveDir:root},outfile:file,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'isolate-identities',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
  api = require(file); const db = api.prisma;
  const course = await db.course.create({data:{name:'isolated roster race',ownerId:'race-owner',ownerName:'Owner',teacherId:'race-owner',teacherName:'Owner',roomType:4,publicApiManaged:true,lifecycleStatus:'draft'}}); courseId = course.id;
  const start = new Date(Date.now()+86400000);
  const lesson = await db.courseSession.create({data:{courseId,title:'fixture',position:1,roomUuid:'race-'+crypto.randomUUID(),roomType:4,status:'scheduled',startTime:start,endTime:new Date(start.getTime()+3600000),leadTeacherId:'race-owner',leadTeacherName:'Owner',createdBy:'race-owner'}});
  const context = {params:Promise.resolve({id:courseId,sessionId:lesson.id})};
  const edit = body => api.PATCH(new Request('http://localhost/lesson',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),context);
  const rules = [{userId:'race-owner',displayName:'Owner',role:'teacher'}];
  // Simulate a future observer writer using the same versioned row-lock protocol
  // as staff grants, and hold its transaction while the old editor reads.
  let locked = gate(), finish = gate();
  let writer = db.$transaction(async tx => {
    const changed = await tx.courseSession.updateMany({where:{id:lesson.id,updatedAt:lesson.updatedAt},data:{updatedAt:new Date(lesson.updatedAt.getTime()+1)}});
    assert.equal(changed.count,1);
    await tx.courseSessionTeacher.create({data:{courseId,sessionId:lesson.id,teacherId:'race-observer',teacherName:'Observer',action:'include',role:'observer'}});
    locked.release(); await finish.promise;
  });
  await locked.promise;
  const pendingEdit = edit({title:'stale edit',teachers:rules});
  await new Promise(resolve => setTimeout(resolve,200)); finish.release(); await writer;
  assert.equal((await pendingEdit).status,409);
  assert.equal((await db.courseSessionTeacher.findFirstOrThrow({where:{sessionId:lesson.id,teacherId:'race-observer'}})).role,'observer');
  assert.equal((await db.courseSession.findUniqueOrThrow({where:{id:lesson.id}})).title,'fixture');
  assert.equal((await edit({leadTeacherId:'race-observer'})).status,400);
  assert.equal((await edit({teachers:rules})).status,409);
  // In the other order, a concurrent staff grant must not overwrite a newer edit.
  await db.courseSessionTeacher.deleteMany({where:{sessionId:lesson.id,teacherId:'race-observer'}});
  const before = await db.courseSession.findUniqueOrThrow({where:{id:lesson.id}});
  locked = gate(); finish = gate();
  writer = db.$transaction(async tx => {
    const changed = await tx.courseSession.updateMany({where:{id:lesson.id,updatedAt:before.updatedAt},data:{title:'newer edit',updatedAt:new Date(Math.max(Date.now(),before.updatedAt.getTime()+1))}});
    assert.equal(changed.count,1); locked.release(); await finish.promise;
  });
  await locked.promise;
  const grant = api.POST(new Request('http://localhost/staff',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':'race-'+crypto.randomUUID()},body:JSON.stringify({staffId:'race-staff',role:'assistant',targets:[{id:lesson.id,updatedAt:before.updatedAt.toISOString()}]})}),{params:Promise.resolve({id:courseId})});
  await new Promise(resolve => setTimeout(resolve,200)); finish.release(); await writer;
  assert.equal((await grant).status,409);
  assert.equal(await db.courseSessionTeacher.count({where:{sessionId:lesson.id,teacherId:'race-staff'}}),0);
  assert.equal((await db.courseSession.findUniqueOrThrow({where:{id:lesson.id}})).title,'newer edit');
  // A form opened before the completed edit must also fail, even when its
  // HTTP request starts after that edit has committed.
  assert.equal((await edit({title:'old form',teachers:rules,expectedVersions:{[lesson.id]:before.updatedAt.toISOString()}})).status,409);
  assert.equal((await db.courseSession.findUniqueOrThrow({where:{id:lesson.id}})).title,'newer edit');
  assert.equal((await edit({title:'ordinary edit',teachers:rules})).status,200);
  const series = await db.courseSessionSeries.create({data:{courseId,timezone:'UTC',recurrenceRule:{weekdays:[1]},durationMinutes:60,createdBy:'race-owner'}});
  const addSeriesLesson = async position => db.courseSession.create({data:{courseId,seriesId:series.id,title:`series-${position}`,position,roomUuid:'race-'+crypto.randomUUID(),roomType:4,status:'scheduled',startTime:new Date(start.getTime()+position*86400000),endTime:new Date(start.getTime()+position*86400000+3600000),leadTeacherId:'race-owner',leadTeacherName:'Owner',createdBy:'race-owner'}});
  const first = await addSeriesLesson(2), second = await addSeriesLesson(3);
  const seriesEdit = (versions, ids = Object.keys(versions)) => api.PATCH(new Request('http://localhost/lesson',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title:'series updated',scope:'future',teachers:rules,expectedVersions:versions,expectedTargetIds:ids})}),{params:Promise.resolve({id:courseId,sessionId:first.id})});
  const versions = {[first.id]:first.updatedAt.toISOString(),[second.id]:second.updatedAt.toISOString()};
  await db.courseSession.update({where:{id:second.id},data:{title:'changed separately',updatedAt:new Date(second.updatedAt.getTime()+1)}});
  assert.equal((await seriesEdit(versions)).status,409);
  assert.equal((await db.courseSession.findUniqueOrThrow({where:{id:first.id}})).title,'series-2');
  const secondCurrent = await db.courseSession.findUniqueOrThrow({where:{id:second.id}});
  versions[second.id] = secondCurrent.updatedAt.toISOString();
  const third = await addSeriesLesson(4);
  assert.equal((await seriesEdit(versions)).status,409);
  assert.equal((await db.courseSession.findUniqueOrThrow({where:{id:first.id}})).title,'series-2');
  versions[third.id] = third.updatedAt.toISOString();
  await db.courseSession.update({where:{id:third.id},data:{isDetached:true}});
  assert.equal((await seriesEdit(versions)).status,409);
  assert.equal((await db.courseSession.findUniqueOrThrow({where:{id:first.id}})).title,'series-2');
  const restored = await db.courseSession.update({where:{id:third.id},data:{isDetached:false}});
  versions[third.id] = restored.updatedAt.toISOString();
  await db.courseSessionTeacher.create({data:{courseId,sessionId:third.id,teacherId:'series-observer',teacherName:'Observer',action:'include',role:'observer'}});
  assert.equal((await seriesEdit(versions)).status,409);
  assert.deepEqual((await db.courseSession.findMany({where:{seriesId:series.id},orderBy:{position:'asc'}})).map(item=>item.title),['series-2','changed separately','series-4']);
  await db.courseSessionTeacher.deleteMany({where:{sessionId:third.id,teacherId:'series-observer'}});
  assert.equal((await seriesEdit(versions)).status,200);
  assert.deepEqual((await db.courseSession.findMany({where:{seriesId:series.id},orderBy:{position:'asc'}})).map(item=>item.title),['series updated','series updated','series updated']);
  const dstSeries=await db.courseSessionSeries.create({data:{courseId,timezone:'America/New_York',recurrenceRule:{weekdays:[0]},durationMinutes:60,createdBy:'race-owner'}});
  const dstFirst=await db.courseSession.create({data:{courseId,seriesId:dstSeries.id,title:'fold-1',position:10,roomUuid:'race-'+crypto.randomUUID(),roomType:4,status:'scheduled',timezone:'America/New_York',startTime:new Date('2027-11-07T05:30:22Z'),endTime:new Date('2027-11-07T06:30:22Z'),leadTeacherId:'race-owner',leadTeacherName:'Owner',createdBy:'race-owner'}});
  const dstNext=await db.courseSession.create({data:{courseId,seriesId:dstSeries.id,title:'fold-2',position:11,roomUuid:'race-'+crypto.randomUUID(),roomType:4,status:'scheduled',timezone:'America/New_York',startTime:new Date('2027-11-14T06:30:22Z'),endTime:new Date('2027-11-14T07:30:22Z'),leadTeacherId:'race-owner',leadTeacherName:'Owner',createdBy:'race-owner'}});
  const dstResponse=await api.PATCH(new Request('http://localhost/lesson',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({title:'renamed',scope:'future',timezone:'America/New_York',startTime:dstFirst.startTime.toISOString(),endTime:dstFirst.endTime.toISOString(),expectedVersions:{[dstFirst.id]:dstFirst.updatedAt.toISOString(),[dstNext.id]:dstNext.updatedAt.toISOString()},expectedTargetIds:[dstFirst.id,dstNext.id]})}),{params:Promise.resolve({id:courseId,sessionId:dstFirst.id})});
  assert.equal(dstResponse.status,200,JSON.stringify(await dstResponse.json()));
  const dstSaved=await db.courseSession.findMany({where:{seriesId:dstSeries.id},orderBy:{position:'asc'}});assert.deepEqual(dstSaved.map(item=>item.startTime.toISOString()),[dstFirst.startTime.toISOString(),dstNext.startTime.toISOString()]);
  const targets=await db.courseSession.findMany({where:{id:{in:[first.id,second.id]}},select:{id:true,updatedAt:true}});
  const key='observer-'+crypto.randomUUID(),payload={staffId:'race-staff',role:'observer',targets:targets.map(item=>({id:item.id,updatedAt:item.updatedAt.toISOString()}))};
  const assign=(body,requestId)=>api.POST(new Request('http://localhost/staff',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':requestId},body:JSON.stringify(body)}),{params:Promise.resolve({id:courseId})});
  assert.equal((await assign(payload,key)).status,200);assert.equal((await assign(payload,key)).status,200);
  assert.equal((await assign({...payload,role:'assistant'},key)).status,409);
  assert.equal(await db.courseSessionTeacher.count({where:{sessionId:{in:targets.map(item=>item.id)},teacherId:'race-staff',role:'observer',action:'include'}}),2);
  const query=new URLSearchParams();targets.forEach(item=>query.append('id',item.id));const listing=await api.staffGet(new api.NextRequest(`http://localhost/staff?${query}`),{params:Promise.resolve({id:courseId})});assert.equal(listing.status,200);assert.ok((await listing.json()).lessons.every(row=>row.observers.some(person=>person.id==='race-staff')));
  const current=await db.courseSession.findMany({where:{id:{in:targets.map(item=>item.id)}},select:{id:true,updatedAt:true}});
  assert.equal((await assign({...payload,role:'remove',targets:current.map(item=>({id:item.id,updatedAt:item.updatedAt.toISOString()}))},'remove-'+crypto.randomUUID())).status,200);
  assert.equal(await db.courseSessionTeacher.count({where:{sessionId:{in:targets.map(item=>item.id)},teacherId:'race-staff',action:'exclude'}}),2);
  const versionsAfterRemove=await db.courseSession.findMany({where:{id:{in:targets.map(item=>item.id)}},select:{id:true,updatedAt:true}});
  assert.equal((await assign({...payload,role:'assistant',targets:versionsAfterRemove.map(item=>({id:item.id,updatedAt:item.updatedAt.toISOString()}))},'assistant-'+crypto.randomUUID())).status,200);
  const versionsAfterAssistant=await db.courseSession.findMany({where:{id:{in:targets.map(item=>item.id)}},select:{id:true,updatedAt:true}});
  const changed=await assign({...payload,targets:versionsAfterAssistant.map(item=>({id:item.id,updatedAt:item.updatedAt.toISOString()}))},'observer-'+crypto.randomUUID());assert.equal(changed.status,200);assert.ok((await changed.json()).changes.every(change=>change.before==='assistant'));
  const joinedLesson=await addSeriesLesson(5);
  const runtime=await db.classroomRuntime.create({data:{courseId,sessionId:joinedLesson.id,status:'live'}});
  const joinedGrant={staffId:'race-staff',role:'observer',targets:[{id:joinedLesson.id,updatedAt:joinedLesson.updatedAt.toISOString()}]};
  locked=gate();finish=gate();
  const joining=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "CourseSession" WHERE "id" = ${joinedLesson.id} FOR UPDATE`;await tx.classroomMemberState.create({data:{runtimeId:runtime.id,courseId,sessionId:joinedLesson.id,userId:'org/RACE-STAFF',role:'student'}});locked.release();await finish.promise;});
  await locked.promise;const racingGrant=assign(joinedGrant,'joined-'+crypto.randomUUID());await new Promise(resolve=>setTimeout(resolve,200));finish.release();await joining;
  assert.equal((await racingGrant).status,409);assert.equal(await db.courseSessionTeacher.count({where:{sessionId:joinedLesson.id,teacherId:'race-staff',role:'observer'}}),0);
  const currentJoined=await db.courseSession.findUniqueOrThrow({where:{id:joinedLesson.id}});
  const repeat=await assign({...joinedGrant,targets:[{id:joinedLesson.id,updatedAt:currentJoined.updatedAt.toISOString()}]},'joined-again-'+crypto.randomUUID());assert.equal(repeat.status,409);assert.equal((await repeat.json()).error,'Observer previously joined this lesson');
  assert.equal((await db.courseSession.findUniqueOrThrow({where:{id:joinedLesson.id}})).updatedAt.toISOString(),currentJoined.updatedAt.toISOString());
  console.log('PASS: version conflicts preserve concurrent staff and lesson changes; observers cannot become lead');
})().finally(async()=>{if(api&&courseId){await api.prisma.courseStaffGrantReceipt.deleteMany({where:{courseId}});await api.prisma.course.delete({where:{id:courseId}});}if(api)await api.prisma.$disconnect();if(dir)await fs.rm(dir,{recursive:true,force:true});}).catch(error=>{console.error(error);process.exitCode=1;});
