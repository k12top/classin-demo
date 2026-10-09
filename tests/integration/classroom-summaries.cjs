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
    "@/lib/session": "export const getSessionFromRequest=async r=>({userId:r.headers.get('x-user')||'teacher'});",
    "@/lib/courseware-access": "export const resolveCoursewareAccess=async identity=>({allowed:identity.userId!=='outsider',teaching:identity.userId==='teacher'});",
  };
  await esbuild.build({ stdin: { contents: `export{prisma}from'@/lib/db';export{GET,POST}from'./src/app/api/sessions/[sessionId]/summary/route';export{generateCourseSessionSummary}from'@/lib/course-session-summary';export{summaryCaptions,exampleAIReport}from'./tests/fixtures/course-summary';export{NextRequest}from'next/server';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-access", setup(build) {
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
    const result = name === "editor" ? api.exampleAIReport : name === "themes" ? { themes: api.exampleAIReport.themes, questions: api.exampleAIReport.questions } : { [fields[name]]: api.exampleAIReport[fields[name]] };
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ output_text: JSON.stringify(result) }));
  });
  await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, { AI_SUMMARY_ENABLED: "true", AI_SUMMARY_API_KEY: "local-fixture", AI_SUMMARY_MODEL: "fixture", AI_SUMMARY_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, AI_SUMMARY_API_STYLE: "responses", AI_SUMMARY_RETRY_COUNT: "1" });
  const course = await db.course.create({ data: { name: "Summary verification", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "代数课", createdBy: "teacher", status: "afterClass", startTime: api.summaryCaptions[0].occurredAt, endTime: api.summaryCaptions.at(-1).occurredAt } });
  const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "ended" } });
  await db.classroomCaption.createMany({ data: api.summaryCaptions.map(item => ({ ...item, runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, externalId: `external-${item.id}`, isFinal: true })) });
  const context = { params: Promise.resolve({ sessionId: lesson.id }) };
  const get = async (user = "teacher") => {
    const response = await api.GET(new api.NextRequest(`http://localhost/api/sessions/${lesson.id}/summary`, { headers: { "x-user": user } }), context);
    return { status: response.status, ...await response.json() };
  };
  const post = async (action, document, user = "teacher") => {
    const response = await api.POST(new api.NextRequest(`http://localhost/api/sessions/${lesson.id}/summary`, { method: "POST", headers: { "x-user": user, "Content-Type": "application/json" }, body: JSON.stringify({ action, document }) }), context);
    return { status: response.status, ...await response.json() };
  };
  try {
    let result = await post("generate");
    assert.equal(result.status, 200); assert.equal(calls, 7); assert.equal(result.summary.status, "draft"); assert.equal(result.summary.document.report.followUps.length, 1);
    assert.equal((await get("student")).summary, null); assert.equal((await get("student")).captions.length, 9); assert.equal((await get("outsider")).status, 403); assert.equal((await post("generate", null, "student")).status, 403);
    console.log("PASS seven real HTTP analysis requests persist a private teacher draft; students see authorized captions only");
    const draft = result.summary.document; draft.overview = "教师审核后的总结"; draft.report.actionItems[0].title = "完成教师修订的练习"; draft.report.actionItems[0].due = "周五";
    result = await post("save", draft); assert.equal(result.status, 200); assert.deepEqual(result.summary.document.actionItems, ["完成教师修订的练习"]); assert.equal(result.summary.document.report.actionItems[0].due, "周五"); assert.equal(result.summary.document.report.participantSummaries.length, 2);
    await post("publish"); result = await get("student"); assert.equal(result.summary.status, "published"); assert.equal(result.summary.document.overview, "教师审核后的总结"); assert.equal(result.summary.document.generation.method, "meeting-multi-agent");
    const before = calls; await api.generateCourseSessionSummary(course.id, lesson.id, "system"); assert.equal(calls, before); assert.equal((await get("student")).summary.status, "published");
    console.log("PASS rich teacher edits and publication survive reads and automatic regeneration");
    await post("unpublish"); assert.equal((await get("student")).summary, null);
    console.log("PASS unpublishing hides every detailed report section from students");
    let release, reached; const wait = new Promise(resolve => release = resolve), arrived = new Promise(resolve => reached = resolve); pause = { wait, reached };
    const generation = post("generate"); await arrived; await post("publish"); release(); result = await generation; pause = null;
    assert.equal(result.status, 500); assert.match(result.error, /changed during generation/); assert.equal((await get("student")).summary.status, "published");
    console.log("PASS a publication during model generation cannot be overwritten by the delayed result");
    failure = true; result = await post("generate"); assert.equal(result.status, 200); assert.equal(result.summary.document.generation.method, "transcript-extract"); assert.equal(result.summary.document.generation.reason, "unavailable"); assert.equal(result.summary.document.report, undefined); assert.equal(result.summary.status, "draft");
    console.log("PASS failed provider generation is explicitly marked as caption extraction");
  } finally { await db.course.delete({ where: { id: course.id } }); await db.$disconnect(); await new Promise(resolve => provider.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
