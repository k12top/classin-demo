/* eslint-disable @typescript-eslint/no-require-imports -- Actual closer and disposable PostgreSQL; external services stubbed. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const esbuild = require("esbuild");

async function main() {
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.pathname, "/classroom_empty_deadline_test");
  const root = path.resolve(__dirname, "../..");
  const bundle = path.join(root, "node_modules/.cache/classroom-empty-deadline.cjs");
  const stubs = {
    "server-only": "",
    "./redis": "export const classroomRedisEnabled=()=>false;export const classroomRedisCommand=async()=>undefined;",
    "./redis-presence": "export const claimRedisEmptyClassroom=async()=>false;export const releaseRedisEmptyClassroom=async()=>{};",
    "./integration-events": "export const enqueueClassroomEvent=async()=>{globalThis.emptyDeadlineEvents++;};",
  };
  globalThis.emptyDeadlineEvents = 0;
  await fs.mkdir(path.dirname(bundle), { recursive: true });
  await esbuild.build({
    stdin: { resolveDir: root, contents: "export {prisma} from '@/lib/db';export {closeEmptyClassrooms} from '@/lib/classroom/server/empty-room';" },
    outfile: bundle, bundle: true, platform: "node", format: "cjs", packages: "external", tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "external-boundaries", setup(build) {
      build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "stub" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "js" }));
    } }],
  });
  const { prisma: db, closeEmptyClassrooms: close } = require(bundle);
  const now = new Date(), minutes = n => new Date(now.getTime() + n * 60_000);
  const courses = [];
  async function fixture(endTime) {
    const course = await db.course.create({ data: { name: "Empty deadline regression", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher", status: "live", endTime: minutes(-60) } });
    courses.push(course.id);
    const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, createdBy: "teacher", status: "live", startTime: minutes(-90), endTime } });
    const runtime = await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live", startedAt: minutes(-90) } });
    await db.classroomMemberState.create({ data: { courseId: course.id, sessionId: lesson.id, runtimeId: runtime.id, userId: "teacher", role: "teacher" } });
    const connection = await db.classroomConnection.create({ data: { id: crypto.randomUUID(), sessionId: lesson.id, userId: "teacher", rtcUid: 100, screenUid: 101, lastSeenAt: minutes(-15), leftAt: minutes(-10) } });
    return { course, lesson, runtime, connection };
  }
  const state = f => db.courseSession.findUniqueOrThrow({ where: { id: f.lesson.id } });
  const observationCount = f => db.classroomProviderEvent.count({ where: { noticeId: `classroom-empty:${f.lesson.id}` } });
  try {
    const future = await fixture(minutes(20));
    assert.equal(await close([future.course.id], minutes(-3)), 0);
    assert.equal(await close([future.course.id], now), 0);
    assert.equal((await state(future)).status, "live");
    assert.equal(await observationCount(future), 0);
    console.log("PASS empty lesson before scheduled end is not a candidate, even with stale course end");

    const end = future.lesson.endTime;
    assert.equal(await close([future.course.id], end), 0);
    assert.equal(await observationCount(future), 1);
    assert.equal(await close([future.course.id], new Date(end.getTime() + 179_999)), 0);
    const results = await Promise.all([close([future.course.id], new Date(end.getTime() + 180_000)), close([future.course.id], new Date(end.getTime() + 180_000))]);
    assert.equal(results.reduce((sum, n) => sum + n, 0), 1);
    assert.equal((await state(future)).status, "finished");
    assert.equal(globalThis.emptyDeadlineEvents, 1);
    console.log("PASS due empty lesson waits full post-end grace and concurrent cron closes exactly once");

    const occupied = await fixture(minutes(-20));
    await close([occupied.course.id], minutes(-3));
    await db.classroomConnection.update({ where: { id: occupied.connection.id }, data: { leftAt: null, lastSeenAt: now } });
    assert.equal(await close([occupied.course.id], now), 0);
    assert.equal((await state(occupied)).status, "live");
    console.log("PASS returning participant prevents empty-room closure after scheduled end");

    const race = await fixture(minutes(-20));
    await close([race.course.id], minutes(-3));
    let release, locked;
    const held = new Promise(resolve => { locked = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const extension = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ClassroomRuntime" WHERE "sessionId"=${race.lesson.id} FOR UPDATE`;
      await tx.courseSession.update({ where: { id: race.lesson.id }, data: { endTime: minutes(60) } });
      locked();
      await gate;
    }, { timeout: 15_000 });
    await held;
    const closing = close([race.course.id], now);
    try {
      const deadline = Date.now() + 5_000;
      while (!(await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%ClassroomRuntime%'`)[0].count) {
        if (Date.now() > deadline) throw new Error("Closer did not reach the lock barrier");
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } finally { release(); }
    await extension;
    assert.equal(await closing, 0);
    assert.equal((await state(race)).status, "live");
    const extendedEnd = minutes(60);
    assert.equal(await close([race.course.id], extendedEnd), 0);
    assert.equal(await close([race.course.id], new Date(extendedEnd.getTime() + 179_999)), 0);
    assert.equal(await close([race.course.id], new Date(extendedEnd.getTime() + 180_000)), 1);
    console.log("PASS committed extension wins over stale cron selection and preserves the new post-end grace");
  } finally {
    await db.course.deleteMany({ where: { id: { in: courses } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
