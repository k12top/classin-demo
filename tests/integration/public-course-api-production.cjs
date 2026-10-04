/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS acceptance runner. */
// Uses the current Next production build against the disposable DB supplied by
// verify-public-course-api.cjs. No supplier or SSO requests are made.
const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
async function main() {
  const database = new URL(process.env.DATABASE_URL);
  assert.equal(database.hostname, "127.0.0.1"); assert.equal(database.pathname, "/public_course_api_test");
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const root = path.resolve(__dirname, "../..");
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: root, env: { ...process.env, CLASSROOM_SESSION_COOKIE_SAME_SITE: "none", CLASSROOM_PUBLIC_BASE_URL: base, CLASSROOM_LIFECYCLE_WEBHOOK_URL: "", CLASSROOM_LIFECYCLE_WEBHOOK_SECRET: "" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostics = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { diagnostics = (diagnostics + chunk).slice(-5000); });
  const endpoint = base + "/api/public/v1/courses";
  const call = async (method, suffix = "", body, key) => {
    const response = await fetch(endpoint + suffix, { method, headers: { Origin: "https://rc.example.com", Cookie: "classroom_session=ignored-by-public-api", ...(body !== undefined && { "Content-Type": "application/json" }), ...(key && { "Idempotency-Key": key }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    return { status: response.status, body: response.status === 204 ? undefined : await response.json() };
  };
  try {
    const deadline = Date.now() + 30_000;
    while (true) {
      try { const ready = await fetch(endpoint, { method: "OPTIONS", signal: AbortSignal.timeout(1000) }); if (ready.status === 204) break; }
      catch { /* local process startup */ }
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Next startup failed: ${diagnostics}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal((await call("OPTIONS")).status, 204);
    assert.equal((await call("POST", "", { name: "missing owner" })).status, 400);
    const created = await call("POST", "", { name: "Production route smoke", ownerId: "external-teacher", roomType: 4 }, "production-create-1");
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const courseId = created.body.course.id;
    const replay = await call("POST", "", { name: "Production route smoke", ownerId: "external-teacher", roomType: 4 }, "production-create-1");
    assert.equal(replay.status, 200, JSON.stringify(replay.body)); assert.equal(replay.body.course.id, courseId);
    assert.equal((await call("GET", `/${courseId}`)).status, 200);
    assert.equal((await call("PATCH", `/${courseId}`, { description: "Updated through real Next HTTP" })).status, 200);
    const lesson = await call("POST", `/${courseId}/sessions`, { startTime: "2026-11-03T01:00:00Z", endTime: "2026-11-03T02:00:00Z" }, "production-lesson-1");
    assert.equal(lesson.status, 201, JSON.stringify(lesson.body));
    const sessionId = lesson.body.session.id;
    assert.equal((await call("PATCH", `/${courseId}/sessions/${sessionId}`, { title: "New title" })).status, 200);
    const deletedSession = await call("DELETE", `/${courseId}/sessions/${sessionId}`);
    assert.equal(deletedSession.status, 200); assert.equal(deletedSession.body.deleted, true);
    const deletedCourse = await call("DELETE", `/${courseId}`);
    assert.equal(deletedCourse.status, 200); assert.equal(deletedCourse.body.deleted, true);
    const protectedRequest = await fetch(base + "/api/classroom/session/leave", { method: "POST", headers: { Origin: "https://rc.example.com", Cookie: "classroom_session=fake", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(protectedRequest.status, 403, "existing cookie API still rejects cross-origin writes");
    console.log("PASS: actual Next production HTTP routes, anonymous creation without credentials, cookie/Origin bypass limited to public routes, CORS preflight, durable idempotency and full course/session CRUD.");
  } catch (error) {
    console.error("Next route diagnostics:", diagnostics);
    throw error;
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
