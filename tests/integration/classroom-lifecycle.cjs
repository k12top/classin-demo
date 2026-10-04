/* eslint-disable @typescript-eslint/no-require-imports -- Node/Electron CommonJS test runner. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const http = require("node:http");
const { createHmac } = require("node:crypto");
const esbuild = require("esbuild");

async function main() {
  const root = path.resolve(__dirname, "../..");
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.pathname, "/classroom_lifecycle_test");
  const received = [];
  let fail = false;
  const receiver = http.createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const signature = createHmac("sha256", "test-secret").update(`${request.headers["x-classroom-timestamp"]}.${body}`).digest("hex");
    assert.equal(request.headers["x-classroom-signature"], `sha256=${signature}`);
    const payload = JSON.parse(body);
    assert.equal(request.headers["x-classroom-event-id"], payload.eventId);
    received.push(payload);
    response.writeHead(fail ? 503 : 204).end();
  });
  await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL = `http://127.0.0.1:${receiver.address().port}/events`;
  process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET = "test-secret";
  delete process.env.CLASSROOM_LIFECYCLE_WEBHOOK_TOKEN;
  process.env.COURSE_FINISHED_DELAY_MINUTES = "20";
  const output = path.join(root, "node_modules/.cache/classroom-lifecycle/acceptance.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "server-only": "",
    "next/server": 'export class NextResponse extends Response { static json(body, init) { return new NextResponse(JSON.stringify(body), {...init, headers: {"Content-Type": "application/json"}}); } } export function after() {}',
    "@/lib/session": 'export async function getSessionFromRequest() { return {userId:"teacher", name:"teacher", displayName:"Teacher", role:"teacher"}; }',
    "@/lib/classroom/server/recording-orchestrator": 'export async function stopActiveRecordingsForCourse() {} export async function stopRecordingAttempt() {} export async function retryFailedLiveRecordings() {} export async function reconcilePendingRecordings() {} export async function requestRecordingStart() {}',
    "@/lib/classroom/server/transcription-orchestrator": 'export async function stopClassroomTranscription() {} export async function syncClassroomTranscription() {} export async function reconcileActiveClassroomTranscriptions() {}',
    "@/lib/course-session-summary": 'export async function generateCourseSessionSummary() {} export async function reconcileCourseSessionSummaries() {}',
  };
  await esbuild.build({
    stdin: { contents: 'export { prisma } from "@/lib/db"; export * from "@/lib/classroom/server/integration-events"; export * from "@/lib/classroom/server/runtime"; export * from "@/lib/classroom/server/connections"; export { promoteCoursesIfDue } from "@/lib/course-promote"; export { POST as lifecycle } from "@/app/api/courses/[id]/sessions/[sessionId]/lifecycle/route";', resolveDir: root, loader: "ts" },
    outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external", tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "isolated-lifecycle", setup(build) {
      build.onResolve({ filter: /.*/ }, ({ path: id }) => id in stubs ? { path: id, namespace: "test-stub" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "test-stub" }, ({ path: id }) => ({ contents: stubs[id], loader: "js" }));
    } }],
  });
  const api = require(output);
  const db = api.prisma;
  const course = await db.course.create({ data: { name: "Integration course", ownerId: "teacher", ownerName: "Teacher", teacherId: "teacher", teacherName: "Teacher" } });
  let position = 0;
  const fixture = async (mode = "classStart") => {
    const lesson = await db.courseSession.create({ data: { courseId: course.id, position: ++position, roomUuid: crypto.randomUUID(), roomType: 4, createdBy: "teacher", startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3_600_000) } });
    await db.classroomRuntime.create({ data: { sessionId: lesson.id, courseId: course.id, status: "waiting", recordingStartMode: mode } });
    return lesson;
  };
  const context = (lesson) => ({ params: Promise.resolve({ id: course.id, sessionId: lesson.id }) });
  const lifecycle = async (lesson, action) => {
    const response = await api.lifecycle(new Request("http://localhost/api/lifecycle", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action }) }), context(lesson));
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  try {
    const lesson = await fixture();
    const teacher = { userId: "teacher", name: "teacher", displayName: "Teacher", avatar: "" };
    const start = () => api.applyClassroomAction({ courseId: course.id, sessionId: lesson.id, session: teacher, role: "teacher", action: { type: "startClass" } });
    await Promise.all([start(), start()]);
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: lesson.id } }), 1, "concurrent starts deduplicate");
    await lifecycle(lesson, "end");
    await lifecycle(lesson, "end");
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: lesson.id } }), 2, "repeated manual end deduplicates");
    const end = await db.classroomIntegrationEvent.findFirst({ where: { sessionId: lesson.id, payload: { path: ["type"], equals: "classroom.ended" } } });
    assert.equal(end.payload.ended, true);
    assert.equal(end.payload.courseStatus, "afterClass");
    assert.equal(end.payload.reason, "teacher_end");
    assert.equal(end.payload.courseId, course.id);

    // The same event ID survives a failure and restart; end cannot overtake it.
    fail = true;
    assert.deepEqual(await api.deliverClassroomEvents(), { delivered: 0, failed: 1 });
    const firstId = received[0].eventId;
    assert.equal(received.length, 1);
    fail = false;
    await db.classroomIntegrationEvent.update({ where: { id: firstId }, data: { nextAttemptAt: new Date(0) } });
    await Promise.all([api.deliverClassroomEvents(), api.deliverClassroomEvents()]);
    assert.equal(received.filter((event) => event.eventId === firstId).length, 2, "one failed and one successful attempt");
    assert.equal(received.filter((event) => event.type === "classroom.ended").length, 1);
    assert.equal(await db.classroomIntegrationEvent.count({ where: { deliveredAt: null } }), 0);

    await lifecycle(lesson, "reopen");
    await lifecycle(lesson, "end");
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: lesson.id } }), 4, "reopen creates a new cycle");

    const scheduled = await fixture("scheduled");
    await Promise.all([api.startScheduledClassroomIfDue(scheduled.id), api.startScheduledClassroomIfDue(scheduled.id)]);
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: scheduled.id } }), 1);
    await db.courseSession.update({ where: { id: scheduled.id }, data: { endTime: new Date(Date.now() - 30 * 60_000) } });
    await api.promoteCoursesIfDue([course.id], { reconcileRecordings: false });
    await api.promoteCoursesIfDue([course.id], { reconcileRecordings: false });
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: scheduled.id } }), 2, "scheduled end persists exactly once");

    const leaveLesson = await fixture();
    await api.touchClassroomMember(course.id, { userId: "student", displayName: "Student", name: "student", avatar: "" }, "student", undefined, leaveLesson.id);
    const clientId = crypto.randomUUID();
    await api.touchClassroomConnection(leaveLesson.id, "student", clientId, true);
    await Promise.all([api.leaveClassroomConnection(leaveLesson.id, "student", clientId, true), api.leaveClassroomConnection(leaveLesson.id, "student", clientId, true)]);
    const departure = await db.classroomIntegrationEvent.findMany({ where: { sessionId: leaveLesson.id } });
    assert.equal(departure.length, 1);
    assert.equal(departure[0].payload.type, "classroom.user_left");
    assert.equal(departure[0].payload.ended, false);
    await api.touchClassroomConnection(leaveLesson.id, "student", clientId, true);
    await api.leaveClassroomConnection(leaveLesson.id, "student", clientId, false);
    assert.equal(await db.classroomIntegrationEvent.count({ where: { sessionId: leaveLesson.id } }), 2, "rejoin allows a new departure");

    const before = await db.classroomIntegrationEvent.count();
    await assert.rejects(db.$transaction(async (tx) => { await api.enqueueClassroomEvent(tx, leaveLesson.id, "classroom.ended", "rollback_test"); throw new Error("rollback"); }), /rollback/);
    assert.equal(await db.classroomIntegrationEvent.count(), before, "outbox rolls back with state");
    await api.deliverClassroomEvents(20);
    assert.equal(await db.classroomIntegrationEvent.count({ where: { deliveredAt: null } }), 0);
    console.log("PASS: real PostgreSQL migration, concurrent start/end, teacher end, scheduled start/end, reopen, departure/rejoin, atomic rollback, signed HTTP delivery, retry identity, ordering and concurrent worker leases.");
  } finally {
    await db.classroomIntegrationEvent.deleteMany();
    await db.course.delete({ where: { id: course.id } });
    await db.$disconnect();
    await new Promise((resolve) => receiver.close(resolve));
  }
}
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
