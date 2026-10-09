/* eslint-disable @typescript-eslint/no-require-imports -- Actual API and disposable PostgreSQL, only authentication/external services are isolated. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");
const { Pool } = require("pg");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/classroom_recovery_"), "requires disposable loopback PostgreSQL");

async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-messages.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "server-only": "",
    "@/lib/classroom/server/integration-events": "export const enqueueClassroomEvent=async()=>{};",
    "@/lib/classroom/server/request-access": `export async function resolveClassroomRequestAccess(request){
      const userId=request.headers.get('x-test-user')||'student';
      if(userId==='unauthorized')return{ok:false,status:401,error:'Unauthorized'};
      return{ok:true,session:{userId,name:userId,displayName:userId},access:{...globalThis.messageFixtureAccess,role:userId==='teacher'?'teacher':userId==='assistant'?'assistant':'student'}};
    }`,
  };
  await esbuild.build({ stdin: { contents: `export{prisma}from'@/lib/db';export{POST,GET}from'@/app/api/courses/[id]/classroom/messages/route';export{requestClassroomMessage}from'@/lib/classroom/message-request';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-auth", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const { prisma: db, POST, GET, requestClassroomMessage } = require(output);
  const course = await db.course.create({ data: { name: "Chat retry verification", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Chat", createdBy: "teacher", startTime: new Date(), endTime: new Date(Date.now() + 3600000) } });
  const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live", revision: 10 } });
  for (const [userId, role] of [["teacher", "teacher"], ["assistant", "assistant"], ["student", "student"], ["other", "student"]]) await db.classroomMemberState.create({ data: { runtimeId: runtime.id, courseId: course.id, sessionId: lesson.id, userId, role } });
  globalThis.messageFixtureAccess = { courseId: course.id, sessionId: lesson.id };
  const context = { params: Promise.resolve({ id: lesson.id }) };
  const send = (body, userId = "student") => POST(new Request("http://localhost/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-test-user": userId }, body: JSON.stringify(body) }), context);
  const get = userId => GET({ headers: new Headers({ "x-test-user": userId }), nextUrl: new URL("http://localhost/messages") }, context);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let lock;
  try {
    const body = { content: "能说话了吗？", scope: "classroom", clientMessageId: crypto.randomUUID() };
    const concurrent = await Promise.all(Array.from({ length: 24 }, () => send(body)));
    const payloads = await Promise.all(concurrent.map(response => response.json()));
    assert.equal(concurrent.filter(response => response.status === 201).length, 1);
    assert.equal(concurrent.filter(response => response.status === 200).length, 23);
    assert.equal(new Set(payloads.map(payload => payload.message.id)).size, 1);
    assert.equal(await db.classroomMessage.count({ where: { sessionId: lesson.id } }), 1);
    assert.equal((await db.classroomRuntime.findUnique({ where: { id: runtime.id } })).revision, 10);
    console.log("PASS 24 concurrent retries produce one message without modifying runtime revision");

    assert.equal((await send({ ...body, content: "Different content" })).status, 409);
    assert.equal((await send({ ...body, clientMessageId: "invalid" })).status, 400);
    assert.equal((await send(body, "other")).status, 201);
    assert.equal((await send({ ...body, clientMessageId: crypto.randomUUID() })).status, 201);
    assert.equal((await send({ content: "Older client without key" })).status, 201);
    assert.equal((await send(body, "unauthorized")).status, 401);
    console.log("PASS key conflicts, malformed keys and unauthorized sends are rejected; sender scope, intentional repetition and old clients work");

    await db.classroomMemberState.update({ where: { sessionId_userId: { sessionId: lesson.id, userId: "student" } }, data: { chatMuted: true } });
    assert.equal((await send(body)).status, 200, "confirm an earlier committed send even if the sender was subsequently muted");
    assert.equal((await send({ content: "Muted" })).status, 403);
    await db.classroomMemberState.update({ where: { sessionId_userId: { sessionId: lesson.id, userId: "student" } }, data: { chatMuted: false } });
    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { chatEnabled: false } });
    assert.equal((await send({ content: "Closed chat" })).status, 403);
    assert.equal((await send({ content: "Teacher", scope: "staff" }, "teacher")).status, 201);
    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { chatEnabled: true } });
    assert.equal((await send({ content: "Staff", scope: "staff" })).status, 403);
    assert.equal((await send({ content: "Assistant", scope: "staff" }, "assistant")).status, 201);
    console.log("PASS chat mute/closed/staff policies are preserved and committed replies remain recoverable");

    const room = await db.classroomSpace.create({ data: { courseId: course.id, sessionId: lesson.id, name: "Group", channelName: crypto.randomUUID(), position: 1 } });
    assert.equal((await send({ content: "Unassigned", scope: "room", spaceId: room.id })).status, 403);
    await db.classroomSpaceMember.create({ data: { courseId: course.id, sessionId: lesson.id, spaceId: room.id, userId: "student" } });
    assert.equal((await send({ content: "Group private", scope: "room", spaceId: room.id })).status, 201);
    assert.equal((await send({ content: "Direct", scope: "direct", recipientId: "teacher" })).status, 201);
    assert.equal((await send({ content: "No recipient", scope: "direct" })).status, 400);
    assert.equal((await send({ content: "Missing", scope: "direct", recipientId: "missing" })).status, 404);
    const otherMessages = (await (await get("other")).json()).messages;
    assert.equal(otherMessages.some(message => ["staff", "room", "direct"].includes(message.scope)), false);
    console.log("PASS group membership, direct recipients and read privacy remain enforced");

    lock = await pool.connect(); await lock.query("BEGIN");
    await lock.query('SELECT "id" FROM "ClassroomRuntime" WHERE "id"=$1 FOR NO KEY UPDATE', [runtime.id]);
    const started = performance.now();
    const unlocked = await send({ content: "Runtime write lock must not block chat", clientMessageId: crypto.randomUUID() });
    assert.equal(unlocked.status, 201, await unlocked.clone().text());
    const elapsed = Math.round(performance.now() - started);
    assert.ok(elapsed < 800, `chat waited ${elapsed}ms on runtime lock`);
    await lock.query("ROLLBACK"); lock.release(); lock = null;
    console.log("PASS message persists while another connection holds runtime update lock; duration", elapsed, "ms");

    const retryBody = { content: "Reply lost after database commit", scope: "classroom", clientMessageId: crypto.randomUUID() };
    let attempts = 0;
    const result = await requestClassroomMessage("http://localhost/messages", retryBody, async (_, init) => {
      const response = await send(JSON.parse(init.body));
      if (++attempts === 1) { assert.equal(response.status, 201); throw new TypeError("Reply lost"); }
      return response;
    }, async () => {});
    assert.equal(attempts, 2); assert.equal(result.response.status, 200);
    assert.equal(await db.classroomMessage.count({ where: { sessionId: lesson.id, content: retryBody.content } }), 1);
    console.log("PASS actual retry helper recovers a lost committed reply without duplicating a message");

    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "ended" } });
    assert.equal((await send({ content: "Ended" })).status, 409);
    assert.equal((await send(retryBody)).status, 200);
    console.log("PASS ended classroom rejects new messages and confirms already committed retries");
  } finally {
    if (lock) { await lock.query("ROLLBACK"); lock.release(); }
    await pool.end(); await db.course.delete({ where: { id: course.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
