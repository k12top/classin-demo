/* eslint-disable @typescript-eslint/no-require-imports -- Actual board API and runtime on disposable PostgreSQL. */
const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/classroom_board_verification", "Requires disposable local PostgreSQL");

async function main() {
  const stubs = {
    "server-only": "",
    "next/server": "export const NextResponse=Response;export const after=()=>{};",
    "@/lib/classroom/server/request-access": "export const resolveClassroomRequestAccess=async()=>({ok:true,session:globalThis.boardActor,access:globalThis.boardActor});",
    "@/lib/classroom/server/integration-events": "export const enqueueClassroomEvent=async()=>{};export const deliverClassroomEvents=async()=>{};",
    "@/lib/classroom/server/transcription-orchestrator": "export const ensureClassroomTranscriptionForLiveSession=async()=>{};export const syncClassroomTranscription=async()=>{};",
    "@/lib/classroom/server/redis-sync": "export const synchronizeClassroomRedis=async()=>{};export const flushClassroomRedisPresence=async()=>{};",
    "@/lib/classroom/server/redis-presence": "export const readRedisClassroomPresence=async()=>null;export const redisClassroomHeartbeat=async()=>null;export const overlayRedisClassroomPresence=s=>s;",
  };
  const outfile = path.join(root, "node_modules/.cache/classroom-board-permissions.cjs");
  await esbuild.build({ stdin: { contents: `export{prisma}from'@/lib/db';export{touchClassroomMember,ensureClassroomRuntime,getClassroomRuntimeSnapshot}from'@/lib/classroom/server/runtime';export{POST}from'@/app/api/sessions/[sessionId]/classroom/actions/route';`, resolveDir: root }, outfile, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "boundaries", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const api = require(outfile), db = api.prisma;
  const course = await db.course.create({ data: { name: "Board permissions verification", teacherId: "teacher", teacherName: "Teacher", ownerId: "teacher", ownerName: "Teacher", autoStudentOnStage: true } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Board permissions", createdBy: "teacher", startTime: new Date(), endTime: new Date(Date.now() + 3600000) } });
  const actor = (userId, role) => ({ userId, name: userId, displayName: userId, avatar: "", role, courseId: course.id, sessionId: lesson.id });
  const post = async (userId, role, action) => {
    globalThis.boardActor = actor(userId, role);
    const response = await api.POST(new Request("http://localhost/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, clientId: "fixture" }) }), { params: Promise.resolve({ sessionId: lesson.id }) });
    return { status: response.status, ...await response.json() };
  };
  const item = { id: "camera:student", kind: "camera", sourceId: "student", visible: true, locked: false, rect: { x: 0, y: 0, width: 0.27, height: 0.23 } };
  const savedComposition = async () => (await api.getClassroomRuntimeSnapshot(course.id, lesson.id)).composition;
  const expectOK = async promise => { const result = await promise; assert.equal(result.status, 200, JSON.stringify(result)); return result; };
  try {
    await api.ensureClassroomRuntime(course.id, lesson.id);
    for (const [id, role] of [["teacher", "teacher"], ["assistant", "assistant"], ["student", "student"], ["second", "student"]]) await api.touchClassroomMember(course.id, actor(id, role), role, undefined, lesson.id);
    await expectOK(post("teacher", "teacher", { type: "placeBoardItem", item }));
    const operations = [
      { type: "placeBoardItem", item },
      { type: "updateBoardItem", itemId: item.id, rect: { ...item.rect, x: 0.4, y: 0.2 } },
      { type: "updateBoardItem", itemId: item.id, shape: "circle" },
      { type: "updateBoardItem", itemId: item.id, locked: false },
      { type: "removeBoardItem", itemId: item.id },
      { type: "bringBoardItemToFront", itemId: item.id },
      { type: "resetComposition" },
      { type: "arrangeVideoGallery" },
    ];
    const before = await savedComposition();
    for (const [id, role] of [["student", "student"], ["second", "student"], ["assistant", "assistant"]]) {
      for (const operation of operations) assert.equal((await post(id, role, operation)).status, 403, `${id}: ${operation.type}`);
    }
    assert.deepEqual(await savedComposition(), before);
    console.log("PASS students, including the camera owner, and unapproved assistants cannot change any shared layout operation");
    for (const role of ["teacher", "assistant"]) {
      if (role === "assistant") await expectOK(post("teacher", "teacher", { type: "setAssistantPermission", targetUserId: "assistant", allowed: true }));
      const moved = { x: 0.4, y: 0.3, width: 0.35, height: 0.32 };
      await expectOK(post(role, role, { type: "updateBoardItem", itemId: item.id, rect: moved, shape: "circle" }));
      let saved = (await savedComposition()).boardItems.find(candidate => candidate.id === item.id);
      assert.deepEqual(saved.rect, moved); assert.equal(saved.shape, "circle");
      await expectOK(post(role, role, { type: "updateBoardItem", itemId: item.id, locked: true }));
      assert.equal((await savedComposition()).boardItems[0].locked, true);
      await expectOK(post(role, role, { type: "updateBoardItem", itemId: item.id, locked: false, shape: "rounded" }));
      await expectOK(post(role, role, { type: "bringBoardItemToFront", itemId: item.id }));
      saved = (await savedComposition()).boardItems.find(candidate => candidate.id === item.id);
      assert.equal(saved.locked, false); assert.equal(saved.shape, "rounded"); assert.deepEqual(saved.rect, moved);
    }
    await expectOK(post("assistant", "assistant", { type: "removeBoardItem", itemId: item.id }));
    assert.equal((await savedComposition()).boardItems.length, 0);
    await expectOK(post("assistant", "assistant", { type: "placeBoardItem", item }));
    await expectOK(post("teacher", "teacher", { type: "updateBoardItem", itemId: item.id, rect: { ...item.rect, x: 0.2 } }));
    console.log("PASS teacher and authorized assistant move, resize, reshape, unlock, reorder and remove another user's camera; changes survive fresh reads regardless of who placed it");
    await expectOK(post("teacher", "teacher", { type: "setAssistantPermission", targetUserId: "assistant", allowed: false }));
    assert.equal((await post("assistant", "assistant", operations[1])).status, 403);
    console.log("PASS assistant management revocation immediately blocks further layout edits");
  } finally { await db.course.delete({ where: { id: course.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
