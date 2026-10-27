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
    "@/lib/session": `export const getSessionFromRequest=async request=>JSON.parse(request.headers.get("x-actor")||"null");`,
    "next/server": "export const NextResponse=Response;export const after=()=>{};",
    "@/lib/classroom/server/request-access": `export const resolveClassroomRequestAccess=async request=>({ok:true,session:JSON.parse(request.headers.get('x-actor')),access:JSON.parse(request.headers.get('x-actor'))});`,
    "@/lib/classroom/server/transcription-orchestrator": "export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};export const stopClassroomTranscription=async()=>{};export const reconcileActiveClassroomTranscriptions=async()=>{};",
    "@/lib/classroom/server/recording-orchestrator": "export const requestRecordingStart=async(courseId,sessionId)=>globalThis.recordingRequests.push(sessionId);export const stopActiveRecordingsForCourse=async()=>{};export const stopRecordingAttempt=async()=>{};export const retryFailedLiveRecordings=async()=>{};export const reconcilePendingRecordings=async()=>{};export const requestRecordingStop=async()=>{};export const processRecordingStop=async()=>{};",
    "@/lib/course-session-summary": "export const reconcileCourseSessionSummaries=async()=>{};",
    "@/lib/course-session-summary-generation": "export const queueCourseSessionSummary=async()=>{};export const processCourseSessionSummaryGeneration=async()=>{};",
    "@/lib/classroom/server/redis-sync": "export const synchronizeClassroomRedis=async()=>{};export const flushClassroomRedisPresence=async()=>{};export const refreshClassroomRedisControl=async()=>{};export const requestClassroomRedisRefresh=async()=>{};",
    "@/lib/classroom/server/redis-presence": "export const readRedisClassroomPresence=async()=>null;export const redisClassroomHeartbeat=async()=>null;export const overlayRedisClassroomPresence=s=>s;",
  };
  const outfile = path.join(root, "node_modules/.cache/classroom-caption-start.cjs");
  await esbuild.build({ stdin: { contents: `export{POST as createCourse}from'@/app/api/courses/route';export{prisma}from'@/lib/db';export*from'@/lib/classroom/server/runtime';export*from'@/lib/classroom/server/connections';export{promoteCoursesIfDue}from'@/lib/course-promote';export{POST}from'@/app/api/sessions/[sessionId]/classroom/actions/route';`, resolveDir: root }, outfile, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "boundaries", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });

  const api=require(outfile),db=api.prisma;let courseId;const teacher={userId:'teacher',name:'teacher',displayName:'Teacher',avatar:'',role:'teacher'};
  const preferences={autoCaptions:true,autoInterpretation:true,sourceLanguage:'zh-CN',targetLanguages:['en-US','ja-JP']};
  const create=async(value,role='teacher')=>api.createCourse(new Request('http://localhost/api/courses',{method:'POST',headers:{'Content-Type':'application/json','x-actor':JSON.stringify({...teacher,role})},body:JSON.stringify({name:'Caption startup '+crypto.randomUUID(),courseKind:'series',captionStartPreferences:value})}));
  const made=await create(preferences);assert.equal(made.status,201,await made.clone().text());const body=await made.json();courseId=body.course.id;assert.deepEqual(body.course.captionStartPreferences,preferences);
  const lesson=async()=>db.courseSession.create({data:{courseId,position:(await db.courseSession.count({where:{courseId}}))+1,roomUuid:crypto.randomUUID(),roomType:4,createdBy:'teacher',startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+3600000)}});
  const post=async(sessionId,action,role='teacher')=>{const actor={...teacher,role,courseId,sessionId,userId:role==='student'?'student':'teacher'};const res=await api.POST(new Request('http://localhost/actions',{method:'POST',headers:{'Content-Type':'application/json','x-actor':JSON.stringify(actor)},body:JSON.stringify({action,clientId:'caption-start-tab'})}),{params:Promise.resolve({sessionId})});return{status:res.status,body:await res.json()}};
  try{
    assert.equal((await create(preferences,'student')).status,403);
    assert.equal((await create({...preferences,targetLanguages:[]})).status,400);
    const first=await lesson();await api.ensureClassroomRuntime(courseId,first.id);
    assert.deepEqual((await db.classroomRuntime.findUniqueOrThrow({where:{sessionId:first.id}})).captionStartPreferences,preferences,'course defaults persist into a new lesson');
    assert.equal((await post(first.id,{type:'setCaptionStartPreferences',preferences},'student')).status,403);
    const off={...preferences,autoCaptions:false,autoInterpretation:false};
    assert.equal((await post(first.id,{type:'setCaptionStartPreferences',preferences:off})).status,200,'actual action route accepts valid preferences');
    assert.deepEqual((await api.getClassroomRuntimeSnapshot(courseId,first.id)).captionStartPreferences,off,'readback after save retains settings');
    assert.equal((await post(first.id,{type:'startClass'})).status,200);
    let state=await db.classroomRuntime.findUniqueOrThrow({where:{sessionId:first.id}});assert.equal(state.interpretationEnabled,false);assert.equal(state.transcriptionStatus,'stopped');assert.deepEqual(state.targetLanguages,[]);
    assert.equal((await post(first.id,{type:'setCaptionStartPreferences',preferences})).status,409,'live lesson cannot rewrite startup policy');
    const manual=await lesson();await api.ensureClassroomRuntime(courseId,manual.id);assert.equal((await post(manual.id,{type:'startClass'})).status,200);
    state=await db.classroomRuntime.findUniqueOrThrow({where:{sessionId:manual.id}});assert.equal(state.interpretationEnabled,true);assert.deepEqual(state.targetLanguages,['en-US','ja-JP']);
    const scheduled=await lesson();await api.ensureClassroomRuntime(courseId,scheduled.id);await api.touchClassroomMember(courseId,teacher,'teacher',undefined,scheduled.id);await api.touchClassroomConnection(scheduled.id,'teacher','caption-start-tab',true);
    await db.classroomRuntime.update({where:{sessionId:scheduled.id},data:{classStartMode:'scheduled'}});
    assert.equal(await api.startScheduledClassroomIfDue(scheduled.id,{userId:'teacher',clientId:'caption-start-tab'}),true);
    state=await db.classroomRuntime.findUniqueOrThrow({where:{sessionId:scheduled.id}});assert.equal(state.interpretationEnabled,true);assert.deepEqual(state.targetLanguages,['en-US','ja-JP']);
    assert.deepEqual((await db.course.findUniqueOrThrow({where:{id:courseId}})).captionStartPreferences,preferences,'a per-lesson override never mutates course defaults');
    const limited=await lesson();await api.ensureClassroomRuntime(courseId,limited.id);
    await api.touchClassroomMember(courseId,{...teacher,userId:'reader',name:'reader'},'student',undefined,limited.id);await api.touchClassroomConnection(limited.id,'reader','caption-limit-tab',true);
    await db.classroomConnection.update({where:{id:`${limited.id}:reader:caption-limit-tab`},data:{captionLanguage:'pt-PT'}});
    const excessive={...preferences,targetLanguages:['en-US','ja-JP','fr-FR','de-DE','ru-RU','es-ES','it-IT','ko-KR','th-TH','vi-VN']};
    assert.equal((await post(limited.id,{type:'setCaptionStartPreferences',preferences:excessive})).status,409,'startup languages respect existing participant demand');
    assert.deepEqual((await db.classroomRuntime.findUniqueOrThrow({where:{sessionId:limited.id}})).captionStartPreferences,preferences,'capacity rejection rolls back the new policy');
    const sourceOnly=await lesson();await api.ensureClassroomRuntime(courseId,sourceOnly.id);const original={...preferences,autoInterpretation:false};assert.equal((await post(sourceOnly.id,{type:'setCaptionStartPreferences',preferences:original})).status,200);assert.equal((await post(sourceOnly.id,{type:'startClass'})).status,200);
    state=await db.classroomRuntime.findUniqueOrThrow({where:{sessionId:sourceOnly.id}});assert.equal(state.interpretationEnabled,true);assert.deepEqual(state.targetLanguages,[],'source captions do not start unrequested translation languages');
    console.log('PASS: actual course-create/action routes, disposable PostgreSQL readback, permissions, validation, per-lesson overrides, manual/scheduled start and disabled/source-only behavior.');
  }finally{if(courseId)await db.course.delete({where:{id:courseId}});await db.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
