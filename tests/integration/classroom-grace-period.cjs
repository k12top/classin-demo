/* eslint-disable @typescript-eslint/no-require-imports -- Isolated PostgreSQL verifies actual classroom closure without cloud side effects. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
const url = new URL(process.env.DATABASE_URL || "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/classroom_recovery_grace", "requires disposable local PostgreSQL");
delete process.env.COURSE_FINISHED_DELAY_MINUTES;
async function main() {
  const output = path.join(root, "node_modules/.cache/classroom-grace-period.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "server-only": "",
    "@/lib/classroom/server/integration-events": "export const enqueueClassroomEvent=async()=>{};",
  };
  await esbuild.build({ stdin: { contents: `export {prisma} from '@/lib/db';export{ensureClassroomRuntime}from'@/lib/classroom/server/runtime';export{promoteCourseSessionIfDue}from'@/lib/course-session-access';export{classroomClosingNotice}from'@/lib/classroom/closing-notice';`, resolveDir: root }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-services", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "js" }));
  } }] });
  const api = require(output), db = api.prisma;
  const course = await db.course.create({ data: { name: "Grace period verification", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  const lesson = await db.courseSession.create({ data: { courseId: course.id, position: 1, roomUuid: crypto.randomUUID(), roomType: 4, title: "Grace", createdBy: "teacher", status: "live", startTime: new Date(Date.now() - 90 * 60_000), endTime: new Date(Date.now() - 25 * 60_000) } });
  await db.classroomRuntime.create({ data: { courseId: course.id, sessionId: lesson.id, status: "live" } });
  try {
    const recordingIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await db.classroomRecording.createMany({ data: ["starting", "recording", "completed"].map((status, index) => ({
      id: recordingIds[index], courseId: course.id, sessionId: lesson.id, provider: "agora",
      channelName: lesson.roomUuid, recorderUserId: `recorder-${index}`, status,
      lastProviderCheckAt: new Date(),
    })) });
    let runtime = await api.ensureClassroomRuntime(course.id, lesson.id);
    assert.equal(runtime.status, "live");
    assert.equal(runtime.graceEndsAt.getTime(), lesson.endTime.getTime() + 30 * 60_000);
    assert.equal((await api.promoteCourseSessionIfDue(lesson)).status, "live");
    const warning = api.classroomClosingNotice({ status: runtime.status, scheduledEndTime: lesson.endTime.toISOString(), graceEndsAt: runtime.graceEndsAt.toISOString(), now: Date.now() });
    assert.equal(warning.phase, "warning"); assert.ok(warning.remainingSeconds > 290);
    const beforeClose = await Promise.all(recordingIds.map(id => db.classroomRecording.findUnique({ where: { id } })));
    assert.deepEqual(beforeClose.map(recording => recording.status), ["starting", "recording", "completed"]);
    assert.ok(beforeClose.every(recording => recording.stopRequestedAt === null));
    console.log("PASS scheduled end plus 25 minutes keeps runtime and access open, with a five-minute warning");

    const expired = await db.courseSession.update({ where: { id: lesson.id }, data: { endTime: new Date(Date.now() - 30 * 60_000 - 1000) } });
    runtime = await api.ensureClassroomRuntime(course.id, lesson.id);
    assert.equal(runtime.status, "ended");
    assert.equal((await db.courseSession.findUnique({ where: { id: lesson.id } })).status, "finished");
    assert.equal(api.classroomClosingNotice({ status: runtime.status, scheduledEndTime: expired.endTime.toISOString(), graceEndsAt: runtime.graceEndsAt.toISOString(), now: Date.now() }), null);
    const afterClose = await Promise.all(recordingIds.map(id => db.classroomRecording.findUnique({ where: { id } })));
    assert.deepEqual(afterClose.map(recording => recording.status), ["stopping", "stopping", "completed"]);
    for (const recording of afterClose.slice(0, 2)) {
      assert.ok(recording.stopRequestedAt instanceof Date);
      assert.equal(recording.lastProviderCheckAt, null);
    }
    assert.equal(afterClose[2].stopRequestedAt, null);
    assert.ok(afterClose[2].lastProviderCheckAt instanceof Date);
    console.log("PASS scheduled end plus 30 minutes closes the actual runtime and lesson, queues active recording stops and preserves completed recordings");

    await db.courseSession.update({ where: { id: lesson.id }, data: { status: "live", endTime: new Date(Date.now() + 60_000) } });
    await db.classroomRuntime.update({ where: { id: runtime.id }, data: { status: "ended" } });
    runtime = await api.ensureClassroomRuntime(course.id, lesson.id);
    assert.equal(runtime.status, "ended");
    console.log("PASS an explicitly ended runtime is never reopened by the grace notice");
  } finally { await db.course.delete({ where: { id: course.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
