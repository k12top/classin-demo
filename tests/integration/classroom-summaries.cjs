/* eslint-disable @typescript-eslint/no-require-imports -- Real summary routes and persistence on disposable PostgreSQL. */
const assert = require("node:assert/strict");
const path = require("node:path");
const http = require("node:http");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/classroom_recovery_summary", "requires disposable local PostgreSQL");
async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-summaries.cjs");
  const stubs = {
    "server-only": "",
    "next/server": "export class NextRequest extends Request{get nextUrl(){return new URL(this.url)}};export const NextResponse={json:(body,init)=>Response.json(body,init)};export const after=callback=>globalThis.summaryAfter.push(callback);",
    "@/lib/session": "export const getSessionFromRequest=async r=>({userId:r.headers.get('x-user')||'teacher',name:'teacher',displayName:'Teacher',role:'teacher'});",
    "@/lib/courseware-access": "export const resolveCoursewareAccess=async identity=>({allowed:identity.userId!=='outsider',teaching:identity.userId==='teacher'});",
    "@/lib/classroom/server/integration-events": "export const enqueueClassroomEvent=async()=>{};export const deliverClassroomEvents=async()=>{};",
    "@/lib/classroom/server/recording-orchestrator": "export const stopActiveRecordingsForCourse=async()=>{if(globalThis.summaryCleanupGate)await globalThis.summaryCleanupGate};export const stopRecordingAttempt=async()=>{};export const reconcilePendingRecordings=async()=>{};export const retryFailedLiveRecordings=async()=>{};export const requestRecordingStart=async()=>{};export const processRecordingStart=async()=>{};",
    "@/lib/classroom/server/transcription-orchestrator": "export const stopClassroomTranscription=async()=>{if(globalThis.summaryCleanupGate)await globalThis.summaryCleanupGate};export const syncClassroomTranscription=async()=>{};export const reconcileActiveClassroomTranscriptions=async()=>{};",
  };
  globalThis.summaryAfter = [];
  await esbuild.build({ stdin: { contents: `export{prisma}from'@/lib/db';export{GET,POST}from'./src/app/api/sessions/[sessionId]/summary/route';export{POST as lifecycle}from'./src/app/api/courses/[id]/sessions/[sessionId]/lifecycle/route';export{generateCourseSessionSummary,reconcileCourseSessionSummaries}from'@/lib/course-session-summary';export{queueCourseSessionSummary,processCourseSessionSummaryGeneration}from'@/lib/course-session-summary-generation';export{summaryCaptions,exampleAIReport,modelReportFor}from'./tests/fixtures/course-summary';export{NextRequest}from'next/server';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-access", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const api = require(output), db = api.prisma;
  let calls = 0, failure = false, pause = null;
  const fields = { participants: "participantSummaries", discussion: "discussionThreads", actions: "actionItems", conclusions: "conclusions", followups: "followUps" };
  const provider = http.createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body), name = input.text.format.name.replace("course_summary_", ""); calls += 1;
    if (pause && name === "editor") { pause.reached(); await pause.wait; }
    if (failure) { res.writeHead(503); res.end("temporary"); return; }
    assert.ok(!body.includes('"captionIds"') && !body.includes('"speakerId"'), "no database reference fields reach any model request");
    const report = api.modelReportFor(api.exampleAIReport, JSON.parse(input.input).transcript);
    const result = name === "editor" ? report : name === "themes" ? { themes: report.themes, questions: report.questions } : { [fields[name]]: report[fields[name]] };
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ output_text: JSON.stringify(result) }));
  });
  await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, { AI_SUMMARY_ENABLED: "true", AI_SUMMARY_API_KEY: "local-fixture", AI_SUMMARY_MODEL: "fixture", AI_SUMMARY_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, AI_SUMMARY_API_STYLE: "responses", AI_SUMMARY_RETRY_COUNT: "1" });
  const course = await db.course.create({ data: { name: "Summary verification", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "代数课", createdBy: "teacher", status: "afterClass", startTime: api.summaryCaptions[0].occurredAt, endTime: api.summaryCaptions.at(-1).occurredAt } });
  const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "ended" } });
  await db.classroomCaption.createMany({ data: api.summaryCaptions.map(item => ({ ...item, runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, externalId: `external-${item.id}`, isFinal: true })) });
  const context = { params: Promise.resolve({ sessionId: lesson.id }) };
  const get = async (user = "teacher", metadataOnly = false) => {
    const response = await api.GET(new api.NextRequest(`http://localhost/api/sessions/${lesson.id}/summary${metadataOnly ? '?summaryOnly=1' : ''}`, { headers: { "x-user": user } }), context);
    return { status: response.status, ...await response.json() };
  };
  const post = async (action, document, user = "teacher") => {
    const response = await api.POST(new api.NextRequest(`http://localhost/api/sessions/${lesson.id}/summary`, { method: "POST", headers: { "x-user": user, "Content-Type": "application/json" }, body: JSON.stringify({ action, document }) }), context);
    return { status: response.status, ...await response.json() };
  };
  const drain = async () => { await Promise.all(globalThis.summaryAfter.splice(0).map(callback => callback())); };
  const generate = async () => { await post("generate"); await drain(); return get(); };
  try {
    let result = await post("generate");
    assert.equal(result.status, 202); assert.equal(calls, 0); assert.equal(result.generation.status, "queued");
    const duplicate = await post("generate"); assert.equal(duplicate.generation.requestId, result.generation.requestId);
    assert.equal((await get("student")).generation, null);
    await drain(); result = await get();
    assert.equal(result.status, 200); assert.equal(calls, 7); assert.equal(result.generation.status, "completed"); assert.equal(result.summary.status, "draft"); assert.equal(result.summary.document.report.followUps.length, 1);
    assert.equal((await get("teacher", true)).captions, undefined, "status polls do not reload captions");
    assert.equal((await get("student")).summary, null); assert.equal((await get("student")).captions.length, 9); assert.equal((await get("outsider")).status, 403); assert.equal((await post("generate", null, "student")).status, 403);
    console.log("PASS generate returns 202 before AI requests, duplicate clicks share one database job, seven HTTP analysis requests persist a draft, metadata-only reads and student isolation");
    const draft = result.summary.document; draft.overview = "教师审核后的总结"; draft.report.actionItems[0].title = "完成教师修订的练习"; draft.report.actionItems[0].due = "周五";
    result = await post("save", draft); assert.equal(result.status, 200); assert.deepEqual(result.summary.document.actionItems, ["完成教师修订的练习"]); assert.equal(result.summary.document.report.actionItems[0].due, "周五"); assert.equal(result.summary.document.report.participantSummaries.length, 2);
    await post("publish"); result = await get("student"); assert.equal(result.summary.status, "published"); assert.equal(result.summary.document.overview, "教师审核后的总结"); assert.equal(result.summary.document.generation.method, "meeting-multi-agent");
    const before = calls; await api.generateCourseSessionSummary(course.id, lesson.id, "system"); assert.equal(calls, before); assert.equal((await get("student")).summary.status, "published");
    console.log("PASS rich teacher edits and publication survive reads and automatic regeneration");
    await post("unpublish"); assert.equal((await get("student")).summary, null);
    console.log("PASS unpublishing hides every detailed report section from students");
    let release, reached; const wait = new Promise(resolve => release = resolve), arrived = new Promise(resolve => reached = resolve); pause = { wait, reached };
    await post("generate"); const generation = drain(); await arrived; await post("publish"); release(); await generation; result = await get(); pause = null;
    assert.equal(result.generation.status, "completed"); assert.equal((await get("student")).summary.status, "published");
    console.log("PASS a publication during generation is preserved and completion does not return a false error");
    failure = true; result = await generate(); assert.equal(result.status, 200); assert.equal(result.summary.document.generation.method, "transcript-extract"); assert.equal(result.summary.document.generation.reason, "unavailable"); assert.equal(result.summary.document.report, undefined); assert.equal(result.summary.status, "draft");
    console.log("PASS failed provider generation is explicitly marked as caption extraction");
    failure = false;
    await api.queueCourseSessionSummary(course.id, lesson.id, "teacher", true);
    await db.courseSessionSummaryGeneration.update({ where: { sessionId: lesson.id }, data: { status: "running", startedAt: new Date(Date.now()-360000), attempts: 1 } });
    const beforeRecovery = calls;
    await Promise.all([api.processCourseSessionSummaryGeneration(lesson.id), api.processCourseSessionSummaryGeneration(lesson.id)]);
    assert.equal(calls-beforeRecovery, 7); assert.equal((await get()).generation.status,"completed");
    console.log("PASS interrupted worker lease recovers once across concurrent workers");
    await db.courseSessionSummaryGeneration.update({where:{sessionId:lesson.id},data:{status:'failed',attempts:1,nextAttemptAt:new Date(0)}});
    const beforeRetry=calls;await api.reconcileCourseSessionSummaries(1,30000);
    assert.equal(calls-beforeRetry,7);assert.equal((await get()).generation.status,'completed');
    await db.courseSessionSummaryGeneration.update({where:{sessionId:lesson.id},data:{status:'running',attempts:3,startedAt:new Date(Date.now()-360000)}});
    const beforeLimit=calls;assert.equal(await api.processCourseSessionSummaryGeneration(lesson.id),false);
    assert.equal(calls,beforeLimit);assert.equal((await get()).generation.status,'failed');
    await generate();assert.equal((await get()).generation.status,'completed');
    console.log('PASS manual generation retries through cron, exhausted worker attempts stop, and an explicit retry starts a fresh budget');

    let position = 1;
    const fixture = async (currentSummary) => {
      const item = await db.courseSession.create({ data: {courseId:course.id,position:++position,roomUuid:crypto.randomUUID(),roomType:4,title:'Automatic summary',createdBy:'teacher',status:'afterClass',startTime:new Date(Date.now()-3600000),endTime:new Date(Date.now()-60000+position)} });
      const room = await db.classroomRuntime.create({data:{courseId:course.id,sessionId:item.id,status:'ended'}});
      const caption = await db.classroomCaption.create({data:{runtimeId:room.id,courseId:course.id,sessionId:item.id,externalId:'one',speakerId:'teacher',speakerName:'Teacher',text:'今天讨论方程的解法。',isFinal:true}});
      if(currentSummary)await db.courseSessionSummary.create({data:{courseId:course.id,sessionId:item.id,generatedBy:'system',captionCount:1,sourceUpdatedAt:caption.updatedAt}});
      return item;
    };
    for(let i=0;i<26;i++)await fixture(true);
    const pending = await fixture(false);
    assert.equal(await api.reconcileCourseSessionSummaries(1,30000),1);
    assert.ok(await db.courseSessionSummary.findUnique({where:{sessionId:pending.id}}));
    console.log("PASS 26 current old drafts do not starve a newer ended lesson in cron reconciliation");

    const automatic = await fixture(false);
    await db.courseSession.update({where:{id:automatic.id},data:{status:'live'}});
    await db.classroomRuntime.update({where:{sessionId:automatic.id},data:{status:'live'}});
    let releaseCleanup; globalThis.summaryCleanupGate = new Promise(resolve=>releaseCleanup=resolve);
    const ended = await api.lifecycle(new api.NextRequest('http://localhost/end',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'end'})}),{params:Promise.resolve({id:course.id,sessionId:automatic.id})});
    assert.equal(ended.status,200,await ended.clone().text());
    assert.equal((await db.courseSessionSummaryGeneration.findUnique({where:{sessionId:automatic.id}})).status,'queued');
    const background = drain();
    const deadline = Date.now()+10000;
    while(!(await db.courseSessionSummary.findUnique({where:{sessionId:automatic.id}}))){if(Date.now()>deadline)throw new Error('Automatic generation was blocked by provider shutdown');await new Promise(resolve=>setTimeout(resolve,20));}
    releaseCleanup(); await background; globalThis.summaryCleanupGate=null;
    assert.equal((await db.courseSessionSummaryGeneration.findUnique({where:{sessionId:automatic.id}})).status,'completed');
    console.log('PASS ending the lesson queues automatically and finishes summary generation while provider shutdown is still blocked');
  } finally { await db.course.delete({ where: { id: course.id } }); await db.$disconnect(); await new Promise(resolve => provider.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
