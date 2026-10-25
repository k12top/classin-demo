/* eslint-disable @typescript-eslint/no-require-imports -- Disposable database and in-memory RTM transport acceptance. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/classroom_hands_"), "requires a disposable loopback classroom_hands_* database");

async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-hand-raise.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "server-only": "",
    "next/server": "export const after=()=>{};export const NextResponse=Response;",
    "@/lib/classroom/server/request-access": "export const resolveClassroomRequestAccess=async()=>globalThis.handActor.allowed===false?{ok:false,status:401,error:'Unauthorized'}:{ok:true,session:globalThis.handActor,access:globalThis.handActor};",
    "@/lib/classroom/server/integration-events": "export const enqueueClassroomEvent=async()=>{};export const deliverClassroomEvents=async()=>{};",
    "@/lib/classroom/server/transcription-orchestrator": "export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};",
    "@/lib/classroom/server/redis-presence": "export const redisClassroomHeartbeat=async()=>null;export const readRedisClassroomPresence=async()=>globalThis.handRedisLeases||null;export const overlayRedisClassroomPresence=s=>s;",
    "agora-rtm": `const clients=new Set();export default {RTM:class {
      constructor(appId,userId){this.userId=userId;clients.add(this)}
      addEventListener(event,listener){this.listener=listener} async login(){}
      async subscribe(channel){this.channel=channel} async unsubscribe(){this.channel=null} async logout(){clients.delete(this)}
      async publish(channel,message){for(const client of clients)if(client.channel===channel)client.listener({message,publisher:this.userId})}
    }};`,
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from '@/lib/db';export * from '@/lib/classroom/server/runtime';export * from '@/lib/classroom/server/connections';export * from '@/lib/classroom/hand-raise';export {AgoraRtmSignalingProvider} from '@/lib/classroom/signaling/agora-client';export {POST} from '@/app/api/sessions/[sessionId]/classroom/actions/route';`, resolveDir: root }, outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "external-boundaries", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "mock" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: root }));
  } }] });
  const api = require(output), db = api.prisma;
  const course = await db.course.create({ data: { name: "Hand raise acceptance", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher", autoStudentOnStage: true } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Hands", createdBy: "teacher", startTime: new Date(), endTime: new Date(Date.now() + 3_600_000) } });
  const runtime = await api.ensureClassroomRuntime(course.id, lesson.id);
  await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "live" } });
  const clientId = "hand-client";
  const actor = (userId, role = "student") => { globalThis.handActor = { userId, name: userId, displayName: userId, avatar: "", role, courseId: course.id, sessionId: lesson.id }; };
  const request = (type, extra = {}) => api.POST(new Request("http://localhost/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, compactHandRaise: true, expectedRevision: -1, action: { type }, ...extra }) }), { params: Promise.resolve({ sessionId: lesson.id }) });
  const student = userId => db.classroomMemberState.findUnique({ where: { sessionId_userId: { sessionId: lesson.id, userId } } });
  const providers = [];
  const check = async (name, fn) => { await fn(); console.log("PASS", name); };
  try {
    for (const [userId, role] of [["teacher", "teacher"], ["alice", "student"], ["bob", "student"]]) {
      actor(userId, role);
      await api.touchClassroomMember(course.id, globalThis.handActor, role, undefined, lesson.id);
      await api.touchClassroomConnection(lesson.id, userId, clientId, true);
    }
    let event;
    await check("API commits the seated student's own hand without granting media", async () => {
      const before = await student("alice"); actor("alice");
      const response = await request("raiseHand", { userId: "bob", action: { type: "raiseHand", targetUserId: "bob" } });
      assert.equal(response.status, 200);
      const payload = await response.json(); assert.deepEqual(Object.keys(payload), ["handRaise"]); event = payload.handRaise;
      assert.equal(event.actorId, "alice"); assert.equal(event.courseId, lesson.id);
      const after = await student("alice"); assert.equal(after.handRaisedAt.toISOString(), event.handRaisedAt);
      for (const key of ["onStage", "stageState", "microphoneAllowed", "cameraAllowed", "whiteboardWritable"]) assert.equal(after[key], before[key]);
      assert.equal((await student("bob")).handRaisedAt, null);
    });
    await check("repeat and concurrent retries keep the first timestamp and revision", async () => {
      const responses = await Promise.all([request("raiseHand"), request("raiseHand"), request("raiseHand")]);
      for (const response of responses) assert.deepEqual((await response.json()).handRaise, event);
    });
    await check("actual Agora adapter delivers raised/lowered states to a teacher through a simulated RTM channel", async () => {
      actor("alice"); await request("lowerHand");
      let view = await api.getClassroomRuntimeSnapshot(course.id, lesson.id);
      const seen = new Map();
      const teacher = new api.AgoraRtmSignalingProvider(); const alice = new api.AgoraRtmSignalingProvider(); const bob = new api.AgoraRtmSignalingProvider(); providers.push(teacher, alice, bob);
      const credential = userId => ({ appId: "fixture", userId: `${userId}:${clientId}`, channelName: "hands-fixture", token: "fixture" });
      await teacher.connect(credential("teacher"), (update, publisher) => {
        if (update.topic !== "hand-raise") return;
        const next = api.applyClassroomHandRaiseUpdate(view, update, publisher, false, seen.get(update.actorId));
        if (next) { view = next; seen.set(update.actorId, update.revision); }
      });
      await alice.connect(credential("alice"), () => {}); await bob.connect(credential("bob"), () => {});
      const raised = (await (await request("raiseHand")).json()).handRaise;
      await alice.publish(raised); assert.deepEqual(api.raisedClassroomHands(view.members).map(member => member.userId), ["alice"]);
      assert.equal(view.revision, raised.revision - 1, "student messages must not advance the control revision");
      const lowered = (await (await request("lowerHand")).json()).handRaise;
      await alice.publish(lowered); assert.equal(api.raisedClassroomHands(view.members).length, 0);
      await alice.publish(raised); assert.equal(api.raisedClassroomHands(view.members).length, 0, "late raises must not resurrect a lowered hand");
      await bob.publish({ ...raised, revision: lowered.revision + 1 }); assert.equal(api.raisedClassroomHands(view.members).length, 0, "another publisher cannot forge Alice's hand");
    });
    await check("closed tabs, stale connections, teaching roles and unauthorized requests are rejected", async () => {
      actor("teacher", "teacher"); assert.equal((await request("raiseHand")).status, 403);
      actor("alice", "assistant"); assert.equal((await request("raiseHand")).status, 403);
      actor("alice"); globalThis.handActor.allowed = false; assert.equal((await request("raiseHand")).status, 401);
      actor("alice"); assert.equal((await request("raiseHand", { clientId: "other-tab" })).status, 409);
      await db.classroomConnection.update({ where: { id: `${lesson.id}:alice:${clientId}` }, data: { lastSeenAt: new Date(Date.now() - 121_000) } });
      assert.equal((await request("raiseHand")).status, 409);
      await api.touchClassroomConnection(lesson.id, "alice", clientId, true);
      await api.leaveClassroomConnection(lesson.id, "alice", clientId, true);
      assert.equal((await request("raiseHand")).status, 409);
      await api.touchClassroomConnection(lesson.id, "alice", clientId, true);
    });
    await check("accepting an invitation and voluntarily leaving clear persisted hands", async () => {
      actor("bob"); await db.classroomMemberState.update({ where: { sessionId_userId: { sessionId: lesson.id, userId: "bob" } }, data: { onStage: false, stageState: "offstage" } });
      await request("raiseHand");
      const action = (userId, role, value) => api.applyClassroomAction({ courseId: course.id, sessionId: lesson.id, session: { userId, displayName: userId, name: userId, avatar: "" }, role, clientId, action: value });
      await action("teacher", "teacher", { type: "inviteStage", targetUserId: "bob" });
      await action("bob", "student", { type: "acceptStage" });
      assert.equal((await student("bob")).handRaisedAt, null);
      await request("raiseHand"); await api.leaveClassroomConnection(lesson.id, "bob", clientId, true);
      assert.equal((await student("bob")).handRaisedAt, null);
    });
    await check("fresh Redis presence supplements PG freshness but cannot reopen a closed PG connection", async () => {
      actor("alice");
      const id = `${lesson.id}:alice:${clientId}`;
      await db.classroomConnection.update({ where: { id }, data: { lastSeenAt: new Date(Date.now() - 130_000) } });
      globalThis.handRedisLeases = [{ id, userId: "alice", leftAt: null, lastSeenAt: Date.now() }];
      assert.equal((await request("raiseHand")).status, 200);
      await db.classroomConnection.update({ where: { id }, data: { leftAt: new Date() } });
      assert.equal((await request("lowerHand")).status, 409);
      globalThis.handRedisLeases = null;
      await api.touchClassroomConnection(lesson.id, "alice", clientId, true); await request("lowerHand");
    });
    await check("teacher acknowledges only a specific pending raise without media grants; stale receipts preserve newer raises", async () => {
      actor("alice"); await request("raiseHand");
      const before = await student("alice");
      const action = { type: "acknowledgeHand", targetUserId: "alice", handRaisedAt: before.handRaisedAt.toISOString() };
      actor("bob"); assert.equal((await request("acknowledgeHand", { action })).status,403,"students cannot clear another hand");
      assert.ok((await student("alice")).handRaisedAt);
      const newer = new Date(before.handRaisedAt.getTime()+1);
      await db.classroomMemberState.update({where:{id:before.id},data:{handRaisedAt:newer}});
      actor("teacher","teacher");
      assert.equal((await request("acknowledgeHand", { action })).status,200);
      assert.equal((await student("alice")).handRaisedAt.toISOString(),newer.toISOString());
      const accepted = await request("acknowledgeHand", { action:{...action,handRaisedAt:newer.toISOString()} });
      assert.equal(accepted.status,200);const payload=await accepted.json();
      assert.equal(payload.runtime.members.find(m=>m.userId==='alice').handRaisedAt,null);
      const after=await student("alice");assert.equal(after.handRaisedAt,null);
      for(const key of ["onStage","stageState","microphoneAllowed","cameraAllowed","whiteboardWritable"])assert.equal(after[key],before[key]);
      assert.equal((await request("acknowledgeHand", { action:{...action,handRaisedAt:newer.toISOString()} })).status,200,"ack retry is idempotent");
      assert.equal((await request("acknowledgeHand", { action:{...action,targetUserId:'teacher'} })).status,409);
      assert.equal((await request("acknowledgeHand", { action:{...action,handRaisedAt:'bad-time'} })).status,400);
    });
    await check("one-to-one and large classes support hands; public broadcasts and ended classrooms retain their restrictions", async () => {
      actor("alice");
      for (const roomType of [0, 2]) {
        await db.courseSession.update({ where: { id: lesson.id }, data: { roomType } });
        assert.equal((await request("raiseHand")).status, 200); await request("lowerHand");
      }
      await db.courseSession.update({ where: { id: lesson.id }, data: { roomType: 10 } }); assert.equal((await request("raiseHand")).status, 409);
      await db.courseSession.update({ where: { id: lesson.id }, data: { roomType: 4 } });
      await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "ended" } }); assert.equal((await request("raiseHand")).status, 409);
    });
  } finally {
    await Promise.all(providers.map(provider => provider.disconnect()));
    await db.course.delete({ where: { id: course.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
