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
    cwd: root, env: { ...process.env, NEXT_PUBLIC_CASDOOR_SERVER_URL: "https://sso.fixture.invalid", NEXT_PUBLIC_CASDOOR_CLIENT_ID: "fixture-classroom", NEXT_PUBLIC_CASDOOR_APP_NAME: "fixture-classroom", SESSION_SECRET: "public-api-local-fixture-secret-32chars", COURSE_FINISHED_DELAY_MINUTES: "20", CLASSROOM_SESSION_COOKIE_SAME_SITE: "none", CLASSROOM_PUBLIC_BASE_URL: base, CLASSROOM_LIFECYCLE_WEBHOOK_URL: "", CLASSROOM_LIFECYCLE_WEBHOOK_SECRET: "" }, stdio: ["ignore", "pipe", "pipe"],
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
    const share = await call("POST", `/${courseId}/sessions/${sessionId}/join-links`, { parentOrigin: "https://rc.example.com" }, "production-embed-link");
    assert.equal(share.status, 201, JSON.stringify(share.body));
    const shareReplay = await call("POST", `/${courseId}/sessions/${sessionId}/join-links`, { parentOrigin: "https://rc.example.com" }, "production-embed-link");
    assert.equal(shareReplay.status, 200); assert.equal(shareReplay.body.link.id, share.body.link.id);
    assert.equal(new URL(share.body.link.embedUrl).origin, base);
    assert.equal(new URL(share.body.link.embedUrl).searchParams.get("embed"), "1");
    const ssoEmbed = new URL(share.body.link.ssoEmbedUrl);
    const embeddedTarget = new URL(share.body.link.embedUrl);
    assert.equal(ssoEmbed.searchParams.get("next"), embeddedTarget.pathname + embeddedTarget.search);
    const ssoEntry = await fetch(ssoEmbed, { redirect: "manual" });
    assert.equal(ssoEntry.status, 307);
    const authorize = new URL(ssoEntry.headers.get("Location"));
    // NEXT_PUBLIC settings may be captured by the build. Inspect the redirect
    // without following it or contacting the configured identity provider.
    assert.ok(["http:", "https:"].includes(authorize.protocol));
    assert.equal(authorize.pathname, "/login/oauth/authorize");
    assert.equal(authorize.searchParams.get("response_type"), "code");
    assert.ok(authorize.searchParams.get("client_id"));
    assert.equal(authorize.searchParams.get("redirect_uri"), base + "/api/auth/callback");
    const returnCookie = ssoEntry.headers.getSetCookie().find((cookie) => cookie.startsWith("auth_return_to="));
    assert.ok(returnCookie);
    assert.equal(decodeURIComponent(returnCookie.split(";")[0].slice("auth_return_to=".length)), embeddedTarget.pathname + embeddedTarget.search);
    assert.match(returnCookie, /HttpOnly/i); assert.match(returnCookie, /SameSite=None/i);
    const callbackWithoutCode = await fetch(base + "/api/auth/callback", { redirect: "manual" });
    assert.equal(callbackWithoutCode.status, 307);
    assert.equal(callbackWithoutCode.headers.get("Location"), base + "/login?error=no_code");
    assert.equal((await call("PATCH", `/${courseId}/sessions/${sessionId}`, { title: "New title" })).status, 200);
    const deletedSession = await call("DELETE", `/${courseId}/sessions/${sessionId}`);
    assert.equal(deletedSession.status, 200); assert.equal(deletedSession.body.deleted, true);
    const deletedCourse = await call("DELETE", `/${courseId}`);
    assert.equal(deletedCourse.status, 200); assert.equal(deletedCourse.body.deleted, true);
    const endedCourse = await call("POST", "", { name: "Ended lesson replay fixture", ownerId: "external-teacher", roomType: 4 });
    assert.equal(endedCourse.status, 201);
    const endedCourseId = endedCourse.body.course.id;
    const endedLesson = await call("POST", `/${endedCourseId}/sessions`, {
      startTime: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      endTime: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    assert.equal(endedLesson.status, 201, JSON.stringify(endedLesson.body));
    const endedSessionId = endedLesson.body.session.id;
    const endedLink = await call("POST", `/${endedCourseId}/sessions/${endedSessionId}/join-links`, { parentOrigin: "https://rc.example.com", lang: "zh-CN" });
    assert.equal(endedLink.status, 201, JSON.stringify(endedLink.body));
    const { SignJWT } = await import("jose");
    const teacherToken = await new SignJWT({ userId: "external-teacher", name: "external-teacher", displayName: "Teacher", role: "teacher", avatar: "", email: "", expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
      .sign(new TextEncoder().encode("public-api-local-fixture-secret-32chars"));
    const teacherLinks = await fetch(`${base}/api/courses/${endedCourseId}/join-links`, { headers: { Cookie: `classroom_session=${teacherToken}` } });
    assert.equal(teacherLinks.status, 200);
    const teacherLink = (await teacherLinks.json()).links.find((link) => link.id === endedLink.body.link.id);
    assert.ok(teacherLink);
    const teacherSso = new URL(teacherLink.ssoEmbedUrl);
    assert.equal(teacherSso.origin, base);
    assert.equal(new URL(teacherSso.searchParams.get("next"), base).searchParams.get("embed"), "1");
    const fixtureToken = await new SignJWT({ userId: "replay-http-viewer", name: "replay-http-viewer", displayName: "Replay viewer", role: "student", avatar: "", email: "", expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
      .sign(new TextEncoder().encode("public-api-local-fixture-secret-32chars"));
    const headers = { Cookie: `classroom_session=${fixtureToken}` };
    const endedEntry = await fetch(endedLink.body.link.embedUrl, { headers, redirect: "manual" });
    const entryHtml = await endedEntry.text();
    // A loading boundary can flush HTTP 200 before Next's server redirect;
    // the streamed HTML then carries the documented meta refresh redirect.
    const streamedRedirect = entryHtml.match(/<meta id="__next-page-redirect"[^>]*content="1;url=([^"]+)"/);
    assert.ok(endedEntry.status === 307 || (endedEntry.status === 200 && streamedRedirect), `Missing Next replay redirect (HTTP ${endedEntry.status})`);
    const target = endedEntry.status === 307 ? endedEntry.headers.get("Location") : streamedRedirect[1].replaceAll("&amp;", "&");
    const playback = new URL(target, base);
    assert.equal(playback.pathname, `/courses/${endedCourseId}/playback`);
    assert.equal(playback.searchParams.get("sessionId"), endedSessionId);
    assert.equal(playback.searchParams.get("embed"), "1");
    assert.equal(playback.searchParams.get("parentOrigin"), "https://rc.example.com");
    assert.equal(playback.searchParams.get("lang"), "zh-CN");
    assert.equal((await fetch(playback, { headers })).status, 200);
    const recordings = await fetch(`${base}/api/sessions/${endedSessionId}/recordings`, { headers });
    assert.equal(recordings.status, 200, await recordings.text());
    const protectedRequest = await fetch(base + "/api/classroom/session/leave", { method: "POST", headers: { Origin: "https://rc.example.com", Cookie: "classroom_session=fake", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(protectedRequest.status, 403, "existing cookie API still rejects cross-origin writes");
    console.log("PASS: actual Next production HTTP routes, direct SSO iframe URL and preserved OAuth return target, anonymous embedded-link generation, ended-link redirect to exact lesson replay, replay recording access, cookie/Origin bypass limited to public routes, CORS preflight, durable idempotency and full course/session CRUD.");
  } catch (error) {
    console.error("Next route diagnostics:", diagnostics);
    throw error;
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
