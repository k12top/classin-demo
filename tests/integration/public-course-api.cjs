/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS acceptance runner. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const http = require("node:http");
const esbuild = require("esbuild");

async function main() {
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.pathname, "/public_course_api_test");
  const root = path.resolve(__dirname, "../..");
  const output = path.join(root, "node_modules/.cache/public-course-api/acceptance.cjs");
  await fs.mkdir(path.dirname(output), { recursive: true });
  const stubs = {
    "server-only": "",
    "next/server": 'export function after(fn) { (globalThis.publicApiAfterJobs ||= []).push(fn); } export class NextResponse extends Response { static json(body, init) { return Response.json(body, init); } }',
    "next/navigation": 'export function redirect(location) { throw Object.assign(new Error("redirect"), {location}); }',
    "next/link": 'export default function Link() { return null; }',
    "@/components/JoinLinkPasscodeGate": 'export default function PasscodeGate() { return null; }',
    "@/lib/session": 'export async function getSession() { return globalThis.embedTestIdentity ?? null; } export async function getSessionFromRequest() { return globalThis.embedTestIdentity ?? null; }',
    "@/lib/i18n/server": 'export async function getServerTranslation() { return {t: (key) => key}; }',
    "@/lib/classroom/server/recording-orchestrator": 'export async function stopActiveRecordingsForCourse(courseId,sessionId) { (globalThis.publicApiProviderStops ||= []).push({courseId,sessionId,kind:"recording"}); }',
    "@/lib/classroom/server/transcription-orchestrator": 'export async function stopClassroomTranscription(courseId,sessionId) { (globalThis.publicApiProviderStops ||= []).push({courseId,sessionId,kind:"transcription"}); }',
  };
  await esbuild.build({ stdin: { contents: `
    export {prisma} from "@/lib/db";
    export * as courses from "@/app/api/public/v1/courses/route";
    export * as course from "@/app/api/public/v1/courses/[courseId]/route";
    export * as sessions from "@/app/api/public/v1/courses/[courseId]/sessions/route";
    export * as session from "@/app/api/public/v1/courses/[courseId]/sessions/[sessionId]/route";
    export * as joinLinks from "@/app/api/public/v1/courses/[courseId]/sessions/[sessionId]/join-links/route";
    export {default as joinPage} from "@/app/join/[token]/page";
    export {POST as verifyPasscode} from "@/app/api/join-links/[token]/verify-passcode/route";
    export {resolveCoursewareAccess} from "@/lib/courseware-access";
    export {clearCourseSessionAccessCache} from "@/lib/course-session-access";
  `, resolveDir: root, loader: "ts" }, outfile: output, bundle: true, format: "cjs", platform: "node", packages: "external", jsx: "automatic", tsconfig: path.join(root, "tsconfig.json"),
    plugins: [{ name: "public-api-test", setup(build) {
      build.onResolve({ filter: /.*/ }, ({ path: id }) => id in stubs ? { path: id, namespace: "test-stub" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "test-stub" }, ({ path: id }) => ({ contents: stubs[id], loader: "js" }));
    } }],
  });
  const api = require(output), db = api.prisma;
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, "http://127.0.0.1");
      const match = /^\/api\/public\/v1\/courses(?:\/([^/]+)(?:\/sessions(?:\/([^/]+)(\/join-links)?)?)?)?$/.exec(url.pathname);
      if (!match) { outgoing.writeHead(404).end(); return; }
      const courseId = match[1], sessionId = match[2];
      const routes = match[3] ? api.joinLinks : sessionId ? api.session : url.pathname.endsWith("/sessions") ? api.sessions : courseId ? api.course : api.courses;
      const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(!["GET", "HEAD"].includes(incoming.method) && { body: Buffer.concat(chunks) }) });
      const response = await routes[incoming.method](request, { params: Promise.resolve({ courseId, sessionId }) });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { outgoing.writeHead(500).end(String(error)); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/public/v1/courses`;
  const call = async (method, path = "", body, key) => {
    const response = await fetch(base + path, { method, headers: { ...(body !== undefined && { "Content-Type": "application/json" }), ...(key && { "Idempotency-Key": key }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
  };
  const expect = async (method, path, body, status, key) => {
    const result = await call(method, path, body, key);
    assert.equal(result.status, status, JSON.stringify(result.body)); return result.body;
  };
  let receiver;
  try {
    const preflight = await call("OPTIONS");
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), null);
    await expect("POST", "", [], 400);
    await expect("POST", "", { name: "Course" }, 400);
    await expect("POST", "", { name: "Course", ownerId: "teacher", publicApiManaged: true }, 400);

    const privateCourse = await db.course.create({ data: { name: "Private course", ownerId: "private-teacher", ownerName: "Private", teacherId: "private-teacher", teacherName: "Private" } });
    for (const method of ["GET", "DELETE", "PATCH"]) await expect(method, `/${privateCourse.id}`, method === "PATCH" ? { name: "spoof" } : undefined, 404);
    await expect("POST", `/${privateCourse.id}/sessions`, { startTime: "2026-11-03T01:00:00Z", endTime: "2026-11-03T02:00:00Z" }, 404);
    assert.equal((await db.course.findUnique({ where: { id: privateCourse.id } })).name, "Private course");

    const create = { name: "Anonymous course", ownerId: "teacher", ownerName: "Teacher", teacherId: "lead", teacherName: "Lead", roomType: 4 };
    const duplicates = await Promise.all([call("POST", "", create, "rc-course-1"), call("POST", "", create, "rc-course-1")]);
    assert.deepEqual(duplicates.map((result) => result.status).sort(), [200, 201]);
    const courseId = duplicates[0].body.course.id;
    assert.equal(duplicates[1].body.course.id, courseId);
    assert.equal(await db.course.count({ where: { publicApiManaged: true } }), 1);
    await expect("POST", "", { ...create, name: "Different body" }, 409, "rc-course-1");
    assert.equal((await expect("GET", `/${courseId}`, undefined, 200)).course.ownerId, "teacher");
    const list = await expect("GET", "?ownerId=teacher&limit=1", undefined, 200);
    assert.equal(list.courses.length, 1); assert.equal(list.courses[0].id, courseId);
    assert.equal((await expect("GET", "?ownerId=private-teacher", undefined, 200)).courses.length, 0);
    await expect("GET", "?limit=1000", undefined, 400);
    await expect("PATCH", `/${courseId}`, { name: "Edited", description: "Public description", roomType: 2 }, 200);
    await expect("PATCH", `/${courseId}`, { ownerId: "other" }, 400);

    const schedule = { title: "First lesson", startTime: "2026-11-03T01:00:00Z", endTime: "2026-11-03T02:00:00Z", students: [{ userId: "student", displayName: "Student" }] };
    const lessonDuplicates = await Promise.all([call("POST", `/${courseId}/sessions`, schedule, "rc-lesson-1"), call("POST", `/${courseId}/sessions`, schedule, "rc-lesson-1")]);
    assert.deepEqual(lessonDuplicates.map((result) => result.status).sort(), [200, 201]);
    const sessionId = lessonDuplicates[0].body.session.id;
    assert.equal(lessonDuplicates[1].body.session.id, sessionId);
    assert.equal(lessonDuplicates[0].body.session.leadTeacherId, "lead");
    assert.equal(lessonDuplicates[0].body.session.roomType, 2);
    await expect("POST", `/${courseId}/sessions`, { ...schedule, title: "different" }, 409, "rc-lesson-1");
    const concurrent = await Promise.all([call("POST", `/${courseId}/sessions`, { ...schedule, title: "second" }), call("POST", `/${courseId}/sessions`, { ...schedule, title: "third" })]);
    assert.deepEqual(concurrent.map((result) => result.status), [201, 201]);
    assert.deepEqual(concurrent.map((result) => result.body.session.position).sort(), [2, 3]);
    const firstPage = await expect("GET", `/${courseId}/sessions?limit=2`, undefined, 200);
    assert.equal(firstPage.sessions.length, 2); assert.ok(firstPage.nextCursor);
    const secondPage = await expect("GET", `/${courseId}/sessions?limit=2&after=${firstPage.nextCursor}`, undefined, 200);
    assert.equal(secondPage.sessions.length, 1);
    assert.equal(new Set([...firstPage.sessions, ...secondPage.sessions].map((session) => session.id)).size, 3);
    await expect("PATCH", `/${courseId}/sessions/${sessionId}`, { title: "Updated lesson", startTime: "2026-11-03T03:00:00Z" }, 400);
    const updated = await expect("PATCH", `/${courseId}/sessions/${sessionId}`, { title: "Updated lesson", startTime: "2026-11-03T03:00:00Z", endTime: "2026-11-03T04:00:00Z", students: [] }, 200);
    assert.equal(updated.session.title, "Updated lesson"); assert.deepEqual(updated.session.students, []);
    await expect("GET", `/${privateCourse.id}/sessions/${sessionId}`, undefined, 404);
    await expect("PATCH", `/${privateCourse.id}/sessions/${sessionId}`, { title: "spoof" }, 404);
    await expect("DELETE", `/${privateCourse.id}/sessions/${sessionId}`, undefined, 404);
    const removed = await expect("DELETE", `/${courseId}/sessions/${sessionId}`, undefined, 200);
    assert.equal(removed.deleted, true);
    await expect("GET", `/${courseId}/sessions/${sessionId}`, undefined, 404);

    const embeddedCourse = (await expect("POST", "", { name: "Embedded lesson", ownerId: "teacher" }, 201)).course;
    const embedSchedule = { startTime: new Date(Date.now() - 60_000).toISOString(), endTime: new Date(Date.now() + 3_600_000).toISOString(), students: [] };
    const embeddedLesson = (await expect("POST", `/${embeddedCourse.id}/sessions`, embedSchedule, 201)).session;
    const otherLesson = (await expect("POST", `/${embeddedCourse.id}/sessions`, embedSchedule, 201)).session;
    const linkPath = `/${embeddedCourse.id}/sessions/${embeddedLesson.id}/join-links`;
    const linkInput = { parentOrigin: "https://rc.example", lang: "zh-CN" };
    const share = (await expect("POST", linkPath, linkInput, 201, "embed-link-1")).link;
    assert.equal((await expect("POST", linkPath, linkInput, 200, "embed-link-1")).link.id, share.id);
    await expect("POST", linkPath, { parentOrigin: "https://different.example" }, 409, "embed-link-1");
    await expect("POST", `/${privateCourse.id}/sessions/${embeddedLesson.id}/join-links`, {}, 404);
    const embeddedUrl = new URL(share.embedUrl);
    assert.equal(embeddedUrl.searchParams.get("parentOrigin"), "https://rc.example");
    assert.equal(embeddedUrl.searchParams.get("embed"), "1");
    assert.ok(share.embedSnippet.includes("&amp;"));
    const ssoEmbeddedUrl = new URL(share.ssoEmbedUrl);
    assert.equal(ssoEmbeddedUrl.pathname, "/api/auth/login");
    assert.equal(ssoEmbeddedUrl.origin, embeddedUrl.origin);
    assert.equal(ssoEmbeddedUrl.searchParams.get("next"), embeddedUrl.pathname + embeddedUrl.search);
    const plainUrl = new URL(share.joinUrl);
    assert.equal(new URL(share.ssoUrl).searchParams.get("next"), plainUrl.pathname + plainUrl.search);
    // A saved response from before the additive fields must also be enriched.
    const saved = await db.publicApiRequest.findFirst({ where: { response: { path: ["link", "id"], equals: share.id } } });
    assert.ok(saved);
    const replayedShare = (await expect("POST", linkPath, linkInput, 200, "embed-link-1")).link;
    assert.equal(replayedShare.ssoEmbedUrl, share.ssoEmbedUrl);
    const token = embeddedUrl.pathname.split("/").at(-1);
    const join = () => api.joinPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve({ embed: "1", parentOrigin: "https://rc.example", lang: "zh-CN" }) });
    globalThis.embedTestIdentity = null;
    await assert.rejects(join(), (error) => error.location?.startsWith("/api/auth/login?next="));
    assert.equal(await db.courseSessionStudent.count({ where: { sessionId: embeddedLesson.id } }), 0);
    const viewer = { userId: "embed-viewer", name: "embed-viewer", displayName: "Viewer", role: "student", avatar: "" };
    globalThis.embedTestIdentity = viewer;
    await assert.rejects(join(), (error) => error.location?.startsWith("/classroom?") && new URL(error.location, "https://local").searchParams.get("sessionId") === embeddedLesson.id);
    await db.courseSession.update({ where: { id: embeddedLesson.id }, data: { status: "afterClass", endedAt: new Date() } });
    await db.classroomRuntime.create({ data: { courseId: embeddedCourse.id, sessionId: embeddedLesson.id, status: "ended" } });
    api.clearCourseSessionAccessCache();
    await assert.rejects(join(), (error) => error.location?.startsWith(`/courses/${embeddedCourse.id}/playback?`) && new URL(error.location, "https://local").searchParams.get("sessionId") === embeddedLesson.id && new URL(error.location, "https://local").searchParams.get("embed") === "1");
    // A first-time viewer arriving after class also receives only lesson access.
    globalThis.embedTestIdentity = { ...viewer, userId: "late-viewer", name: "late-viewer" };
    await assert.rejects(join(), (error) => error.location?.includes("/playback?"));
    assert.equal((await api.resolveCoursewareAccess(globalThis.embedTestIdentity, embeddedCourse.id, embeddedLesson.id)).allowed, true);
    assert.equal((await api.resolveCoursewareAccess(globalThis.embedTestIdentity, embeddedCourse.id, otherLesson.id)).allowed, false);
    assert.equal(await db.courseStudent.count({ where: { courseId: embeddedCourse.id } }), 0);
    const protectedShare = (await expect("POST", linkPath, { ...linkInput, passcode: "123456" }, 201)).link;
    const protectedToken = new URL(protectedShare.embedUrl).pathname.split("/").at(-1);
    const gate = await api.joinPage({ params: Promise.resolve({ token: protectedToken }), searchParams: Promise.resolve({ embed: "1" }) });
    assert.equal(gate.props.token, protectedToken);
    const verify = (passcode) => api.verifyPasscode(new Request("http://local/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "live", passcode, embed: true, parentOrigin: "https://rc.example" }) }), { params: Promise.resolve({ token: protectedToken }) });
    assert.equal((await verify("999999")).status, 400);
    const verified = await verify("123456");
    assert.equal(verified.status, 200);
    assert.ok((await verified.json()).redirectTo.includes("/playback?"));
    await db.courseJoinLink.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
    globalThis.embedTestIdentity = { ...viewer, userId: "blocked-viewer", name: "blocked-viewer" };
    await join();
    assert.equal(await db.courseSessionStudent.count({ where: { sessionId: embeddedLesson.id, studentId: "blocked-viewer" } }), 0);
    await db.courseJoinLink.update({ where: { id: share.id }, data: { revokedAt: null, expiresAt: new Date(0) } });
    await join();
    await db.courseJoinLink.update({ where: { id: share.id }, data: { expiresAt: null } });
    await db.courseSession.update({ where: { id: embeddedLesson.id }, data: { status: "cancelled" } });
    await assert.rejects(join(), (error) => error.location?.startsWith("/access-denied"));
    console.log("PASS: anonymous embedded and direct SSO link generation, enriched idempotent snapshots, private scope isolation, live-to-replay routing, exact lesson enrollment, password gate, expired/revoked/cancelled denial and iframe query preservation.");

    const single = (await expect("POST", "", { name: "Single course", ownerId: "teacher", courseKind: "standalone" }, 201)).course;
    await expect("POST", `/${single.id}/sessions`, schedule, 201);
    await expect("POST", `/${single.id}/sessions`, schedule, 409);
    assert.equal((await expect("DELETE", `/${single.id}`, undefined, 200)).deleted, true);

    const activeId = concurrent[0].body.session.id;
    const startedAt = new Date();
    await db.courseSession.update({ where: { id: activeId }, data: { status: "live" } });
    await db.classroomRuntime.create({ data: { sessionId: activeId, courseId, status: "live", startedAt } });
    await db.courseAttendance.create({ data: { sessionId: activeId, courseId, studentId: "student" } });
    const recording = await db.classroomRecording.create({ data: { sessionId: activeId, courseId, provider: "agora", channelName: "test", recorderUserId: "test", status: "recording" } });
    await expect("PATCH", `/${courseId}/sessions/${activeId}`, { roomType: 4 }, 409);
    await expect("PATCH", `/${courseId}/sessions/${activeId}`, { title: "Live lesson title" }, 200);
    const callbacks = [];
    receiver = http.createServer(async (request, response) => { let body = ""; for await (const chunk of request) body += chunk; callbacks.push(JSON.parse(body)); response.writeHead(204).end(); });
    await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    process.env.CLASSROOM_LIFECYCLE_WEBHOOK_URL = `http://127.0.0.1:${receiver.address().port}/events`;
    process.env.CLASSROOM_LIFECYCLE_WEBHOOK_SECRET = "test-only";
    delete process.env.CLASSROOM_LIFECYCLE_WEBHOOK_TOKEN;
    const cancelled = await expect("DELETE", `/${courseId}/sessions/${activeId}`, undefined, 200);
    assert.equal(cancelled.deleted, false); assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.session.classroomStatus, "ended");
    assert.equal((await db.classroomRuntime.findUnique({ where: { sessionId: activeId } })).status, "ended");
    assert.ok((await db.courseAttendance.findFirst({ where: { sessionId: activeId } })).leftAt);
    assert.equal((await db.classroomRecording.findUnique({ where: { id: recording.id } })).status, "stopping");
    while (globalThis.publicApiAfterJobs?.length) await globalThis.publicApiAfterJobs.shift()();
    assert.equal(callbacks.length, 1); assert.equal(callbacks[0].type, "classroom.ended"); assert.equal(callbacks[0].ended, true);
    assert.equal(globalThis.publicApiProviderStops.length, 2);
    const originalEndedAt = cancelled.session.endedAt;
    assert.equal((await expect("DELETE", `/${courseId}/sessions/${activeId}`, undefined, 200)).session.endedAt, originalEndedAt);
    await expect("PATCH", `/${courseId}/sessions/${activeId}`, { title: "ended" }, 409);
    const archived = await expect("DELETE", `/${courseId}`, undefined, 200);
    assert.equal(archived.archived, true); assert.equal(archived.deleted, false);
    assert.equal((await db.classroomRecording.findUnique({ where: { id: recording.id } })).status, "stopping");
    await expect("POST", `/${courseId}/sessions`, schedule, 409);
    await expect("PATCH", `/${courseId}`, { name: "archived" }, 409);
    console.log("PASS: anonymous HTTP CRUD, CORS, ownership recording, private-course isolation, idempotent concurrent create, lesson position serialization, pagination, roster/time edits, physical deletion, cancellation/archive, attendance closure, recording stop persistence and lifecycle webhook.");
  } finally {
    await db.publicApiRequest.deleteMany(); await db.classroomIntegrationEvent.deleteMany(); await db.course.deleteMany();
    await db.$disconnect(); await new Promise((resolve) => server.close(resolve));
    if (receiver) await new Promise((resolve) => receiver.close(resolve));
  }
}
main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
