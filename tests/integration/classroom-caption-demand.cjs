/* eslint-disable @typescript-eslint/no-require-imports -- Disposable PostgreSQL acceptance harness. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.startsWith("/classroom_captions_")) throw new Error("Requires a disposable loopback classroom_captions_* database");

async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-caption-demand.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  globalThis.captionJobs = [];
  globalThis.captionProviderCalls = [];
  const mocks = {
    "server-only": "",
    "next/server": `export class NextResponse extends Response {static json(value,init){return new Response(JSON.stringify(value),{...init,headers:{'Content-Type':'application/json',...init?.headers}})}};export const after=callback=>globalThis.captionJobs.push(callback);`,
    "@/lib/classroom/server/request-access": `export async function resolveClassroomRequestAccess(){const a=globalThis.captionActor;return a.allowed===false?{ok:false,status:403,error:'Forbidden',code:'forbidden'}:{ok:true,session:{userId:a.userId},access:{sessionId:a.sessionId,courseId:a.courseId,role:a.role}}}`,
    "@/lib/classroom/server/integration-events": "export const enqueueClassroomEvent=async()=>{};export const deliverClassroomEvents=async()=>{};",
    "@/lib/classroom/transcription/agora-stt": `import {buildAgoraSttJoinPayload,buildAgoraSttUpdatePayload} from '${root}/src/lib/classroom/transcription/agora-stt-payload';export const isAgoraTranscriptionConfigured=()=>true;export const normalizeAgoraTranscriptionStatus=()=> 'running';export const queryAgoraTranscription=async()=>({status:'RUNNING'});export const stopAgoraTranscription=async()=>{};export const startAgoraTranscription=async input=>{globalThis.captionProviderCalls.push({kind:'start',input,payload:buildAgoraSttJoinPayload({...input,taskName:'fixture',subscriberUid:'1',publisherUid:'2'})});return {agentId:'fixture-agent',status:'running'}};export const updateAgoraTranscription=async (id,input)=>{globalThis.captionProviderCalls.push({kind:'update',input,payload:buildAgoraSttUpdatePayload(input)});await globalThis.captionProviderBarrier?.();return {status:'RUNNING'}};`,
    "@/lib/classroom/translation/wordly": `export const isWordlyConfigured=()=>true;export const isWordlyHealthy=async()=>true;export const wordlyTranslationCapabilities=async()=>({configured:true,targetLanguages:['zh-CN','en-US','bm','chm'],maxTargetLanguages:2});export const stopWordlyRoom=async()=>{};export const ensureWordlyRoom=async input=>{globalThis.captionProviderCalls.push({kind:'wordly',input})};export const translateCaptionWithWordly=async (id,input)=>{globalThis.captionProviderCalls.push({kind:'translate',input});return {...input,translations:{bm:'Bambara text',chm:'Mari text'}}};`,
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from './src/lib/db';export * from './src/lib/classroom/server/caption-demand';export * from './src/lib/classroom/server/connections';export * from './src/lib/classroom/server/runtime';export * from './src/lib/classroom/server/transcription-orchestrator';export * from './src/lib/classroom/server/captions';export {POST as preference} from './src/app/api/sessions/[sessionId]/classroom/caption-preference/route';`, resolveDir: root }, outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "external-boundaries", setup(build) {
    build.onResolve({ filter: /^(server-only|next\/server|@\/lib\/classroom\/(server\/(request-access|integration-events)|transcription\/agora-stt|translation\/wordly))$/ }, args => ({ path: args.path, namespace: "mock" }));
    build.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js", resolveDir: root }));
  } }] });
  const api = require(output); const db = api.prisma;
  const course = await db.course.create({ data: { name: "Caption demand acceptance", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, createdBy: "teacher", title: "Caption demand", status: "live", startTime: new Date(), endTime: new Date(Date.now() + 3_600_000) } });
  const runtime = await api.ensureClassroomRuntime(course.id, lesson.id);
  await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "live", interpretationEnabled: true, transcriptionStatus: "starting" } });
  const actor = userId => { globalThis.captionActor = { userId, courseId: course.id, sessionId: lesson.id, role: "student" }; };
  const connect = async (userId, clientId = "caption-client") => {
    await db.classroomMemberState.upsert({ where: { sessionId_userId: { sessionId: lesson.id, userId } }, create: { runtimeId: runtime.id, sessionId: lesson.id, courseId: course.id, userId, displayName: userId, role: "student" }, update: {} });
    await api.touchClassroomConnection(lesson.id, userId, clientId, true);
  };
  const request = async (userId, language, extra = {}) => {
    actor(userId);
    return api.preference(new Request("http://localhost/preference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: "caption-client", language, ...extra }) }), { params: Promise.resolve({ sessionId: lesson.id }) });
  };
  const flush = async () => { while (globalThis.captionJobs.length) await globalThis.captionJobs.shift()(); };
  const targets = async () => (await db.classroomRuntime.findUnique({ where: { sessionId: lesson.id } })).targetLanguages;
  const check = async (name, run) => { await run(); console.log("PASS", name); };
  try {
    await connect("alice"); await connect("bob");
    await check("new lesson starts ASR without any translation channel", async () => {
      assert.deepEqual(await targets(), []); await api.ensureClassroomTranscriptionForLiveSession(course.id, lesson.id);
      const start = globalThis.captionProviderCalls.find(call => call.kind === "start"); assert.ok(start); assert.equal(start.payload.translateConfig, undefined);
    });
    await check("student selection enables exactly one requested language", async () => {
      assert.equal((await request("alice", "ja-JP")).status, 200); await flush();
      assert.deepEqual(await targets(), ["ja-JP"]); assert.deepEqual(globalThis.captionProviderCalls.at(-1).payload.translateConfig.languages[0].target, ["ja-JP"]);
    });
    await check("two students share one channel and switching retains the other demand", async () => {
      await request("bob", "ja-JP"); await flush(); const before = globalThis.captionProviderCalls.length;
      await request("bob", "ja-JP"); await flush(); assert.equal(globalThis.captionProviderCalls.length, before);
      await request("alice", "fr-FR"); await flush(); assert.deepEqual(await targets(), ["fr-FR", "ja-JP"]);
      await request("bob", null); await flush(); assert.deepEqual(await targets(), ["fr-FR"]);
    });
    await check("choices arriving during a provider update converge to the latest union", async () => {
      let entered; const waiting = new Promise(resolve => { entered = resolve; }); let release;
      globalThis.captionProviderBarrier = () => { entered(); return new Promise(resolve => { release = resolve; }); };
      await request("alice", "de-DE"); const first = flush(); await waiting;
      await request("bob", "es-ES"); globalThis.captionProviderBarrier = null; release(); await first;
      assert.deepEqual(await targets(), ["de-DE", "es-ES"]);
      assert.deepEqual(globalThis.captionProviderCalls.at(-1).payload.translateConfig.languages[0].target, ["de-DE", "es-ES"]);
    });
    await check("simultaneous database choices retain both users and independent tabs", async () => {
      await Promise.all([api.saveCaptionPreference(lesson.id, "alice", "caption-client", "fr-FR"), api.saveCaptionPreference(lesson.id, "bob", "caption-client", "ja-JP")]);
      assert.deepEqual(await targets(), ["fr-FR", "ja-JP"]);
      await connect("alice", "caption-second");
      await api.saveCaptionPreference(lesson.id, "alice", "caption-second", "de-DE");
      assert.deepEqual(await targets(), ["de-DE", "fr-FR", "ja-JP"]);
      await api.saveCaptionPreference(lesson.id, "alice", "caption-second", null);
      await api.saveCaptionPreference(lesson.id, "alice", "caption-client", "de-DE");
      await api.saveCaptionPreference(lesson.id, "bob", "caption-client", "es-ES");
      assert.deepEqual(await targets(), ["de-DE", "es-ES"]);
    });
    await check("language selection cannot update another account or a left tab", async () => {
      const denied = await request("mallory", "it-IT", { userId: "alice" }); assert.equal(denied.status, 409);
      assert.deepEqual(await targets(), ["de-DE", "es-ES"]);
      await api.leaveClassroomConnection(lesson.id, "bob", "caption-client", true);
      assert.equal((await request("bob", "it-IT")).status, 409); assert.deepEqual(await targets(), ["de-DE"]);
      actor("alice"); globalThis.captionActor.allowed = false;
      assert.equal((await api.preference(new Request("http://localhost/preference", { method: "POST", body: JSON.stringify({ clientId: "caption-client", language: "it-IT" }) }), { params: Promise.resolve({ sessionId: lesson.id }) })).status, 403);
    });
    await check("off, original-only and expired demand remove the last translation channel", async () => {
      await request("alice", null); await flush(); assert.deepEqual(await targets(), []);
      assert.equal(globalThis.captionProviderCalls.at(-1).payload.translateConfig.enable, false);
      await request("alice", "th-TH"); await flush();
      await db.classroomConnection.update({ where: { id: `${lesson.id}:alice:caption-client` }, data: { lastSeenAt: new Date(Date.now() - 130_000) } });
      await api.ensureClassroomTranscriptionForLiveSession(course.id, lesson.id); assert.deepEqual(await targets(), []);
      assert.equal(globalThis.captionProviderCalls.at(-1).payload.translateConfig.enable, false);
    });
    await check("capacity rejects the extra channel atomically while existing choices remain usable", async () => {
      const languages = ["en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "it-IT", "ru-RU", "th-TH", "vi-VN", "es-ES"];
      for (let i = 0; i < languages.length; i++) { await connect(`user-${i}`); assert.equal((await request(`user-${i}`, languages[i])).status, 200); }
      await connect("overflow"); let response = await request("overflow", "pt-PT"); assert.equal(response.status, 409); assert.equal((await response.json()).code, "caption_language_limit");
      assert.equal((await db.classroomConnection.findUnique({ where: { id: `${lesson.id}:overflow:caption-client` } })).captionLanguage, null);
      assert.equal((await request("overflow", "en-US")).status, 200);
      response = await request("overflow", "pt-PT"); assert.equal(response.status, 409);
      assert.equal((await db.classroomConnection.findUnique({ where: { id: `${lesson.id}:overflow:caption-client` } })).captionLanguage, "en-US");
      await flush(); assert.equal((await targets()).length, 10);
    });
    await check("old teacher clients cannot reopen unused channels", async () => {
      await db.classroomConnection.updateMany({ where: { sessionId: lesson.id }, data: { captionLanguage: null } });
      await api.applyClassroomAction({ courseId: course.id, sessionId: lesson.id, session: { userId: "teacher", displayName: "Teacher", name: "teacher", avatar: "" }, role: "teacher", action: { type: "setInterpretation", enabled: true, provider: "shengwang", sourceLanguage: "zh-CN", targetLanguages: ["en-US", "ja-JP"] } });
      assert.deepEqual(await targets(), []);
    });
    await check("automatic routing shares Amharic on Shengwang and sends only extra targets to the bridge", async () => {
      await connect("alice"); await connect("bob");
      assert.equal((await request("alice", "am-ET")).status, 200);
      assert.equal((await request("bob", "bm")).status, 200);
      await flush();
      assert.deepEqual(await targets(), ["am-ET", "bm"]);
      const native = globalThis.captionProviderCalls.filter(call => call.kind === "update").at(-1);
      assert.deepEqual(native.payload.translateConfig.languages[0].target, ["am-ET"]);
      const room = globalThis.captionProviderCalls.filter(call => call.kind === "wordly").at(-1);
      assert.deepEqual(room.input.targetLanguages, ["bm"]);
      const caption = { id: "mixed-caption", text: "Hello", sourceLanguage: "zh-CN", detectedLanguage: "zh-CN", translations: { "am-ET": "ሰላም" }, isFinal: true, speakerId: "teacher", occurredAt: new Date().toISOString() };
      const result = await api.ingestClassroomCaption(course.id, caption, lesson.id);
      assert.equal(result.caption.translations.bm, "Bambara text");
      assert.equal(result.caption.translations["am-ET"], "ሰላም");
      const count = globalThis.captionProviderCalls.filter(call => call.kind === "translate").length;
      await api.ingestClassroomCaption(course.id, caption, lesson.id);
      assert.equal(globalThis.captionProviderCalls.filter(call => call.kind === "translate").length, count);
      const unsupported = await request("bob", "xx-XX");
      assert.equal(unsupported.status, 400);
      assert.deepEqual(await targets(), ["am-ET", "bm"]);
      await request("alice", null); await request("bob", null); await flush();
    });
    await check("Wordly rejects unsupported languages and never translates with zero demand", async () => {
      await db.classroomRuntime.update({ where: { sessionId: lesson.id }, data: { interpretationProvider: "wordly" } });
      await connect("alice"); const response = await request("alice", "km-KH"); assert.equal(response.status, 400); assert.equal((await response.json()).code, "caption_language_unsupported");
      const before = globalThis.captionProviderCalls.filter(call => call.kind === "translate").length;
      await api.ingestClassroomCaption(course.id, { id: "fixture-caption", text: "Hello", sourceLanguage: "zh-CN", detectedLanguage: "zh-CN", translations: {}, isFinal: true, speakerId: "teacher", occurredAt: new Date().toISOString() }, lesson.id);
      assert.equal(globalThis.captionProviderCalls.filter(call => call.kind === "translate").length, before);
    });
    await check("source-language readers need no translation and ended lessons reject new demand", async () => {
      assert.equal((await request("alice", "zh-CN")).status, 200); assert.deepEqual(await targets(), []);
      await flush();
      await db.classroomRuntime.update({ where: { sessionId: lesson.id }, data: { status: "ended" } });
      const response = await request("alice", "en-US"); assert.equal(response.status, 409); assert.equal((await response.json()).code, "classroom_ended");
    });
  } finally { await db.course.delete({ where: { id: course.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
