/* eslint-disable @typescript-eslint/no-require-imports -- Isolated PostgreSQL/HTTP acceptance. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const http = require("node:http");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const database = new URL(process.env.DATABASE_URL || "http://invalid");
if (database.hostname !== "127.0.0.1" || !database.pathname.startsWith("/classroom_captions_")) throw Error("Requires isolated loopback classroom_captions_* database");

class MemoryStorage {
  data = new Map();
  get length() { return this.data.size; }
  key(i) { return [...this.data.keys()][i] ?? null; }
  getItem(k) { return this.data.get(k) ?? null; }
  setItem(k, v) { this.data.set(k, v); }
  removeItem(k) { this.data.delete(k); }
}

async function main() {
  const output = path.join(root, "node_modules/.cache/caption-delivery-acceptance.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const mocks = {
    "server-only": "",
    "next/server": "export class NextResponse extends Response { static json(value,init){return new Response(JSON.stringify(value),{...init,headers:{'Content-Type':'application/json',...init?.headers}})}};export const after=()=>{};",
    "@/lib/session": "export const getSessionFromRequest=async request=>{const userId=request.headers.get('x-test-user');return userId?{userId,name:userId}:null;};",
    "@/lib/classroom/server/runtime": "import {prisma} from '@/lib/db';export const ensureClassroomRuntime=async (_course,sessionId)=>prisma.classroomRuntime.findUniqueOrThrow({where:{sessionId}});",
    "@/lib/classroom/translation/wordly": "export const wordlyTranslationCapabilities=async()=>({configured:false,targetLanguages:[],maxTargetLanguages:0});export const ensureWordlyRoom=async()=>{throw Error('Archive replay must not start a provider');};export const translateCaptionWithWordly=async()=>{throw Error('Unexpected paid translation');};",
  };
  await esbuild.build({ stdin: { contents: `
    export {prisma} from './src/lib/db';
    export {POST as ingest} from './src/app/api/sessions/[sessionId]/classroom/captions/route';
    export {GET as playback} from './src/app/api/sessions/[sessionId]/summary/route';
    export {createCaptionPersistenceQueue} from './src/lib/classroom/caption-persistence';
    export {createCaptionOutbox} from './src/lib/classroom/caption-outbox';
    export {deliverClassroomCaption} from './src/lib/classroom/caption-delivery';
    export {createRecorderPageUrl} from './src/lib/classroom/server/recorder-token';
  `, resolveDir: root }, outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external", tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "external-boundaries", setup(build) {
      build.onResolve({ filter: /^(server-only|next\/server|@\/lib\/(session|classroom\/(server\/runtime|translation\/wordly)))$/ }, args => ({ path: args.path, namespace: "mock" }));
      build.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js", resolveDir: root }));
    } }],
  });
  const api = require(output), db = api.prisma;
  const createdAt = new Date(Date.now() - 86_400_000);
  const course = await db.course.create({ data: { name: "Caption delivery acceptance", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher", teachers: { create: { teacherId: "teacher", teacherName: "Teacher" } }, students: { create: { studentId: "student", studentName: "Student" } } } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, createdBy: "teacher", createdAt, status: "live", startTime: new Date(Date.now() - 3_600_000), endTime: new Date(Date.now() + 3_600_000) } });
  await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live", startedAt: lesson.startTime, interpretationEnabled: false } });
  const originalFetch = global.fetch;
  let failure = "", errors = [];
  const server = http.createServer(async (request, response) => {
    try {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const url = new URL(request.url, "http://localhost");
      const body = Buffer.concat(chunks).toString();
      const req = new Request(url, { method: request.method, headers: request.headers, ...(body ? { body } : {}) });
      req.nextUrl = url;
      if (failure === "offline") { response.writeHead(503).end('{"error":"offline"}'); return; }
      if (failure === "ignored") { response.writeHead(200, { "Content-Type": "application/json" }).end('{"ignored":true}'); return; }
      const result = request.method === "GET"
        ? await api.playback(req, { params: Promise.resolve({ sessionId: lesson.id }) })
        : await api.ingest(req, { params: Promise.resolve({ sessionId: lesson.id }) });
      if (failure === "lost-ack") { response.writeHead(503).end('{"error":"lost response"}'); return; }
      response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
    } catch (error) { response.writeHead(500).end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  global.fetch = (input, init = {}) => originalFetch(new URL(input, origin), { ...init, headers: { "x-test-user": "teacher", ...init.headers } });
  const storage = new MemoryStorage(), store = api.createCaptionOutbox(storage, "teacher", lesson.id);
  const caption = (id, extra = {}) => ({ id, text: `Speech ${id}`, speakerId: "teacher", speakerName: "Teacher", sourceLanguage: "zh-CN", detectedLanguage: "zh-CN", translations: {}, isFinal: false, occurredAt: new Date(Date.now() - 120_000).toISOString(), ...extra });
  const queue = () => api.createCaptionPersistenceQueue(value => api.deliverClassroomCaption(lesson.id, value), error => errors.push(error), 60_000, { store });
  let active;
  try {
    active = queue(); failure = "offline";
    active.enqueue(caption("partial")); await active.flush();
    assert.equal(store.read().length, 1); assert.equal(await db.classroomCaption.count(), 0);
    active.dispose();
    // More than 30 seconds after class: the old arrival-time gate lost this.
    const endedAt = new Date(Date.now() - 60_000);
    await db.courseSession.update({ where: { id: lesson.id }, data: { status: "finished", endedAt } });
    await db.classroomRuntime.update({ where: { sessionId: lesson.id }, data: { status: "ended" } });
    failure = ""; active = queue(); await active.flush();
    assert.equal(storage.length, 0);
    assert.equal((await db.classroomCaption.findFirst()).isFinal, false);
    console.log("PASS offline partial survives teardown, reload and late post-class delivery through real roster ACL/HTTP/PostgreSQL");

    active.enqueue(caption("partial", { isFinal: true, translations: { "en-US": "Final translation" } }));
    failure = "lost-ack"; await active.flush();
    assert.equal(store.read().length, 1);
    assert.equal(await db.classroomCaption.count(), 1);
    failure = ""; await active.flush();
    assert.equal(storage.length, 0); assert.equal(await db.classroomCaption.count(), 1);
    assert.equal((await db.classroomCaption.findFirst()).translations["en-US"], "Final translation");
    console.log("PASS lost HTTP acknowledgement retries without duplicate rows and merges final translation");

    failure = "ignored"; active.enqueue(caption("not-acked")); await active.flush();
    assert.equal(store.read().length, 1, "a 200 ignored response must not delete local receipt");
    failure = ""; await active.flush();
    for (let i = 0; i < 103; i++) active.enqueue(caption(`partial-${i}`));
    await active.flush(); assert.equal(storage.length, 0);
    const firstPage = await (await fetch(`/api/sessions/${lesson.id}/summary`)).json();
    assert.equal(firstPage.captions.length, 100); assert.ok(firstPage.nextCaptionCursor);
    const secondPage = await (await fetch(`/api/sessions/${lesson.id}/summary?captionCursor=${firstPage.nextCaptionCursor}`)).json();
    assert.equal(firstPage.captions.length + secondPage.captions.length, 105);
    console.log("PASS playback returns partial-only speech across pagination, even without a published summary");

    for (const [actor, status] of [["student", 403], ["outsider", 403], ["", 401]]) {
      const response = await originalFetch(`${origin}/api/sessions/${lesson.id}/classroom/captions`, { method: "POST", headers: { "Content-Type": "application/json", "x-test-user": actor }, body: JSON.stringify({ caption: caption("unauthorized") }) });
      assert.equal(response.status, status);
    }
    assert.equal(await db.classroomCaption.count({ where: { externalId: "unauthorized" } }), 0);
    process.env.CLASSROOM_RECORDER_SECRET = crypto.randomUUID(); process.env.CLASSROOM_PUBLIC_BASE_URL = origin;
    const token = new URL(await api.createRecorderPageUrl(lesson.id, "recording")).searchParams.get("recorderToken");
    const response = await originalFetch(`${origin}/api/sessions/${lesson.id}/classroom/captions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recorderToken: token, caption: caption("recorder") }) });
    assert.equal(response.status, 200);
    console.log("PASS teacher/recorder delivery remains authorized after class; students, outsiders and anonymous writes stay denied");
    assert.ok(errors.length >= 3);
  } finally {
    active?.dispose(); global.fetch = originalFetch;
    await new Promise(resolve => server.close(resolve));
    await db.course.delete({ where: { id: course.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
