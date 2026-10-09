/* eslint-disable @typescript-eslint/no-require-imports -- Isolated integration harness. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const { Pool } = require("pg");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/classroom_recovery_"), "requires a disposable loopback database");

async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-presence-stress.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "server-only": "",
    "@/lib/classroom/server/integration-events": "export const enqueueClassroomEvent=async()=>{};",
    "@/lib/classroom/server/request-access": `export async function resolveClassroomRequestAccess(){return {ok:true,session:globalThis.stressActor,access:globalThis.stressAccess}}`,
    "@/lib/classroom/translation/wordly": "export const ensureWordlyRoom=async()=>{};export const translateCaptionWithWordly=async(_,caption)=>caption;",
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from '@/lib/db';export * from '@/lib/classroom/server/runtime';export * from '@/lib/classroom/server/connections';export * from '@/lib/classroom/server/captions';export {POST as chat} from '@/app/api/courses/[id]/classroom/messages/route';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-services", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "mock" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const api = require(output), db = api.prisma;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const course = await db.course.create({ data: { name: "Presence stress", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Presence stress", createdBy: "teacher", startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3_600_000) } });
  let lock;
  const teacher = { userId: "teacher", name: "teacher", displayName: "Teacher", avatar: "" };
  const student = { userId: "student", name: "student", displayName: "Student", avatar: "" };
  try {
    let runtime = await api.ensureClassroomRuntime(course.id, lesson.id);
    assert.equal(runtime.targetLanguages.length, 10);
    await api.touchClassroomMember(course.id, teacher, "teacher", undefined, lesson.id);
    await api.touchClassroomMember(course.id, student, "student", undefined, lesson.id);
    await api.touchClassroomConnection(lesson.id, student.userId, "stress-client", true);
    runtime = await api.applyClassroomAction({ courseId: course.id, sessionId: lesson.id, session: teacher, role: "teacher", action: { type: "startClass" } });
    assert.equal(runtime.interpretation.targetLanguages.length, 10);
    const studentMember = runtime.members.find(member => member.userId === student.userId);
    assert.equal(studentMember.onStage, true); assert.equal(studentMember.microphoneAllowed, true); assert.equal(studentMember.chatMuted, false);
    console.log("PASS class start preserves student media/chat permissions and enables ten targets");

    lock = await pool.connect(); await lock.query("BEGIN");
    await lock.query('SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId"=$1 FOR UPDATE', [lesson.id]);
    const started = Date.now();
    await Promise.all(Array.from({ length: 12 }, () => api.ensureClassroomRuntime(course.id, lesson.id)));
    assert.ok(Date.now() - started < 1_500, "unchanged runtime must not await its write lock");
    await lock.query("ROLLBACK"); lock.release(); lock = null;
    console.log("PASS repeated runtime reads do not contend with the teacher's write lock");

    const old = new Date(Date.now() - 90_000);
    await db.classroomConnection.updateMany({ where: { sessionId: lesson.id }, data: { lastSeenAt: old } });
    const snapshot = await api.getClassroomRuntimeSnapshot(course.id, lesson.id);
    const stale = snapshot.members.find(member => member.userId === "student");
    assert.equal(stale.online, false); assert.equal(stale.onStage, true); assert.equal(stale.microphoneAllowed, true); assert.equal(stale.rtcUids.length, 1);
    console.log("PASS expired heartbeat retains RTC identity and accepted stage permissions");

    globalThis.stressActor = student;
    globalThis.stressAccess = { courseId: course.id, sessionId: lesson.id, role: "student" };
    const context = { params: Promise.resolve({ id: lesson.id }) };
    const work = Array.from({ length: 15 }, (_, i) => api.ingestClassroomCaption(course.id, { id: `sentence-${i}`, speakerId: "student", speakerName: "Student", text: `Sentence ${i}`, sourceLanguage: "zh-CN", detectedLanguage: "zh-CN", translations: { "en-US": `Translation ${i}` }, isFinal: true, occurredAt: new Date().toISOString() }, lesson.id));
    work.push(api.chat(new Request("http://localhost/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "Still online" }) }), context).then(async response => { assert.equal(response.status, 201, await response.clone().text()); }));
    work.push(api.touchClassroomConnection(lesson.id, student.userId, "stress-client"));
    await Promise.all(work);
    assert.equal(await db.classroomCaption.count({ where: { sessionId: lesson.id } }), 15);
    assert.equal(await db.classroomMessage.count({ where: { sessionId: lesson.id } }), 1);
    assert.ok((await db.classroomConnection.findFirst({ where: { sessionId: lesson.id } })).lastSeenAt > old);
    console.log("PASS concurrent captions, student chat and heartbeat complete with a pool of three");

    await api.applyClassroomAction({ courseId: course.id, sessionId: lesson.id, session: teacher, role: "teacher", action: { type: "setInterpretation", enabled: true, provider: "shengwang", sourceLanguage: "zh-CN", targetLanguages: ["ja-JP", "th-TH"] } });
    runtime = await api.applyClassroomAction({ courseId: course.id, sessionId: lesson.id, session: teacher, role: "teacher", action: { type: "startClass" } });
    assert.deepEqual(runtime.interpretation.targetLanguages, ["ja-JP", "th-TH"]);
    console.log("PASS teacher-selected output languages survive repeated start actions");
  } finally {
    if (lock) { await lock.query("ROLLBACK"); lock.release(); }
    await db.classroomConnection.deleteMany({ where: { sessionId: lesson.id } });
    await db.course.delete({ where: { id: course.id } });
    await db.$disconnect(); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
