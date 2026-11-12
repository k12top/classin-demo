/* eslint-disable @typescript-eslint/no-require-imports -- Browser acceptance with isolated PostgreSQL and synthetic authentication. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http"), esbuild = require("esbuild");
const { openHarness } = require("./activity-harness.cjs");
const root = path.resolve(__dirname, "../.."), output = path.join(root, "outputs/activity-improvements");
// CI may provide Playwright from its shared runtime without changing the app's dependencies.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
let harness, server, browser, debug = async () => {};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const h = harness = await openHarness();
  await fs.mkdir(output, { recursive: true });
  for (const userId of ["unanswered"]) await h.db.classroomMemberState.create({ data: { runtimeId: h.runtime.id, courseId: h.course.id, sessionId: h.lesson.id, userId, displayName: userId, role: "student", presence: "online" } });
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{ClassroomChatPanel}from'@/components/classroom/classroom-chat-panel';import{StudentActivityOverlay}from'@/components/classroom/student-activity-overlay';import{ClassroomSyncProvider,useClassroomSyncOwner}from'@/lib/classroom/use-classroom-sync';
  const who=new URLSearchParams(location.search).get('who')||'teacher';
  function Test(){const sync=useClassroomSyncOwner('${h.lesson.id}',true);return <ClassroomSyncProvider value={sync}><div className="classroom-v3-shell" style={{height:'100vh',position:'relative',background:'#eef1f7'}}><main className="classroom-v3-stage" style={{position:'absolute',inset:0,padding:24}}><h1>弱网课堂题目验证</h1><p>发布、作答、统计与答案范围</p></main>{who==='teacher'?<aside style={{position:'absolute',right:12,top:12,bottom:12,width:'min(460px,calc(100% - 24px))',display:'flex',flexDirection:'column',background:'white',overflow:'auto',padding:12}}><ClassroomChatPanel sessionId="${h.lesson.id}" currentUserId="teacher" role="teacher" visible messages={[]} spaces={[]} activeSpaceId={null} canManage students={[]} disabled={false} busy={false} onSend={async()=>true} onDelete={()=>{}} onMuteAll={()=>{}} onActivityChanged={()=>{}}/></aside>:<StudentActivityOverlay sessionId="${h.lesson.id}" currentUserId={who} onChanged={()=>{}}/>}</div></ClassroomSyncProvider>};createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Test/></I18nProvider>);`;
  const bundle = await esbuild.build({ stdin: { contents: entry, resolveDir: root, loader: "tsx" }, bundle: true, write: false, outfile: "app.js", platform: "browser", format: "iife", define: { "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json") });
  const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text, css = bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text || "";
  let loseCreateAck = true, createResponseDropped = false, answerAcknowledged = false;
  const requests = [], revisions = [], errors = [];
  server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://fixture"), who = /who=([^;]+)/.exec(request.headers.cookie || "")?.[1] || "student";
      const actor = h.actor(who);
      if (url.pathname === "/app.js") { response.setHeader("Content-Type", "text/javascript"); return response.end(js); }
      if (url.pathname === "/app.css") { response.setHeader("Content-Type", "text/css"); return response.end(css); }
      if (url.pathname.includes("/classroom/activities")) {
        const id = url.pathname.split("/")[6]; let data;
        if (url.searchParams.has("versionOnly")) {
          const runtime = await h.db.classroomRuntime.findUniqueOrThrow({ where: { id: h.runtime.id } });
          data = { revision: runtime.activityRevision }; revisions.push(who);
        } else if (request.method === "GET") {
          data = id ? await h.api.activityDetail(actor, id) : await h.api.listActivities(actor);
          if (id) await delay(250);
        } else {
          const chunks = []; for await (const chunk of request) chunks.push(chunk);
          const body = JSON.parse(Buffer.concat(chunks).toString());
          if (url.pathname.endsWith("/draft")) {
            data = { draft: { title: "Wrong AI type", kind: "quiz", durationSec: null, definition: { questions: [{ id: "q1", type: "boolean", prompt: "Wrong type", points: 10, options: [{ id: "a", text: "正确" }, { id: "b", text: "错误" }], correct: ["a"] }] } } };
          } else if (request.method === "POST") {
            requests.push(body.requestId); data = await h.api.createActivity(actor, body.activity, body.requestId, body.start);
            if (loseCreateAck) { loseCreateAck = false; await delay(8000); createResponseDropped = true; response.destroy(); return; }
          } else {
            data = await h.api.commandActivity(actor, id, body);
            if (body.action === "answer") { await delay(5000); answerAcknowledged = true; }
          }
        }
        response.setHeader("Content-Type", "application/json"); return response.end(JSON.stringify(data));
      }
      if (url.pathname.startsWith("/api/")) { response.setHeader("Content-Type", "application/json"); return response.end(JSON.stringify({ messages: [] })); }
      if (url.pathname !== "/") { response.statusCode = 404; return response.end(); }
      response.setHeader("Set-Cookie", `who=${url.searchParams.get("who") || "student"}; Path=/; HttpOnly; SameSite=Strict`);
      response.setHeader("Content-Type", "text/html;charset=utf-8");
      response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;font-family:system-ui}*{box-sizing:border-box}.classroom-v3-message-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:8px}.classroom-v3-chat-form{display:flex;gap:6px;flex-wrap:wrap}.classroom-v3-chat-form textarea{width:100%}button{cursor:pointer}.classroom-chat-compose-tools{display:flex;gap:6px}.classroom-chat-compose-tools button{width:36px;height:36px}.classroom-v3-panel-empty{padding:12px;color:#657080}h1{font-size:20px}</style><div id="root"></div><script src="/app.js"></script></html>');
    } catch (error) { console.error("Fixture request failed", request.method, request.url, error.message); response.statusCode = error.status || 500; response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function make(who, width) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/?who=${who}&lang=zh-CN`); return page;
  }
  const teacher = await make("teacher", 1180), student = await make("student", 390), late = await make("student2", 1180), none = await make("unanswered", 390);
  debug = async () => { console.error({ errors, requests, revisions: revisions.length, activities: await h.db.classroomActivity.findMany({ where: { sessionId: h.lesson.id }, select: { status: true, title: true } }), teacher: await teacher.locator('body').innerText(), student: await student.locator('body').innerText() }); await teacher.screenshot({ path: path.join(output, 'failure-teacher.png') }); await student.screenshot({ path: path.join(output, 'failure-student.png') }); };
  await teacher.getByRole("button", { name: "AI 出题", exact: true }).click();
  await teacher.getByRole("combobox", { name: "选择活动" }).selectOption("multiple");
  await teacher.getByRole("textbox", { name: "出题要求" }).fill("Choose prime numbers");
  await teacher.getByRole("button", { name: "生成题目", exact: true }).click();
  await teacher.getByText("生成未完成，要求已保留。可重试或手动出题。").waitFor();
  assert.equal(await teacher.locator('[data-quick-creator]').innerText().then(text => text.includes("Wrong type")), false, "wrong AI type never reaches preview");
  await teacher.getByRole("button", { name: "手动出题", exact: true }).click();
  await teacher.getByRole("button", { name: "删除选项", exact: true }).last().click();
  assert.equal(await teacher.getByRole("textbox", { name: /^选项 / }).count(), 3);
  await teacher.getByRole("button", { name: "添加选项", exact: true }).click();
  assert.equal(await teacher.getByRole("textbox", { name: /^选项 / }).count(), 4);
  assert.equal(await teacher.getByRole("checkbox").count(), 4);
  await teacher.getByRole("button", { name: "修改要求", exact: true }).click();
  await teacher.getByRole("combobox", { name: "选择活动" }).selectOption("single");
  await teacher.getByRole("button", { name: "手动出题", exact: true }).click();
  await teacher.getByRole("button", { name: "删除选项", exact: true }).last().click();
  assert.equal(await teacher.getByRole("textbox", { name: /^选项 / }).count(), 3);
  await teacher.getByRole("button", { name: "添加选项", exact: true }).click();
  await teacher.getByRole("textbox", { name: "题干", exact: true }).fill("Weak network question: 2 + 2 = ?");
  for (const [index, value] of ["4", "5", "6", "7"].entries()) await teacher.getByRole("textbox", { name: `选项 ${String.fromCharCode(65 + index)}`, exact: true }).fill(value);
  await teacher.getByRole("radio", { name: "正确答案 A", exact: true }).check();
  const started = Date.now(); await teacher.getByRole("button", { name: "发布给学生", exact: true }).click();
  await teacher.locator("[data-activity-pending]").waitFor({ timeout: 1000 });
  const pendingMs = Date.now() - started; assert.ok(pendingMs < 1000);
  await teacher.screenshot({ path: path.join(output, "teacher-pending-desktop.png") });
  await student.locator('[data-student-activity] input').first().waitFor({ timeout: 15000 });
  await teacher.waitForFunction(() => document.querySelectorAll('[data-activity-pending]').length === 0, null, { timeout: 15000 });
  assert.equal(createResponseDropped, false, "teacher confirms publication from the feed before the POST transport times out");
  assert.equal(await h.db.classroomActivity.count({ where: { sessionId: h.lesson.id } }), 1);
  assert.ok(requests.length >= 1); assert.equal(new Set(requests).size, 1, "lost create acknowledgement cannot duplicate the question");
  await teacher.getByRole("button", { name: "AI 出题", exact: true }).click();
  await teacher.getByRole("button", { name: "手动出题", exact: true }).click();
  await teacher.getByRole("textbox", { name: "题干", exact: true }).fill("Next question");
  for (const [index,value] of ["1","2","3","4"].entries()) await teacher.getByRole("textbox", { name: `选项 ${String.fromCharCode(65+index)}`, exact: true }).fill(value);
  await teacher.getByRole("radio", { name: "正确答案 A", exact: true }).check();
  assert.equal(await teacher.getByRole("button", { name: "发布给学生", exact: true }).isEnabled(), true, "authoritative feed receipt unlocks publishing despite a lost POST response");
  await teacher.getByRole("button", { name: "关闭", exact: true }).click();
  await student.locator('input[type="radio"]').nth(1).check();
  const answerStarted = Date.now();
  await student.getByRole("button", { name: "提交答案", exact: true }).click();
  await student.getByText("正在提交…", { exact: true }).waitFor({ timeout: 800 });
  await teacher.locator('[data-judgment="incorrect"]').first().waitFor({ timeout: 15000 });
  const teacherSyncMs = Date.now() - answerStarted;
  assert.equal(answerAcknowledged, false, "teacher sees the saved answer before the student's delayed HTTP acknowledgement");
  await teacher.locator('[data-answer-distribution]').nth(1).hover();
  await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).waitFor();
  assert.ok((await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).innerText()).includes("student"));
  await teacher.screenshot({ path: path.join(output, "teacher-choice-hover-desktop.png") });
  await teacher.getByRole("button", { name: "关闭学生名单", exact: true }).click();
  await teacher.mouse.move(0, 0);
  await teacher.locator('[data-answer-distribution]').nth(1).focus();
  await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).waitFor();
  await teacher.getByRole("button", { name: "关闭学生名单", exact: true }).focus();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).isVisible(), true, "keyboard focus inside the list keeps it open");
  await teacher.getByRole("button", { name: "仅已作答学生", exact: true }).focus();
  await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).waitFor({ state: "hidden",timeout:3000 });
  await teacher.locator('[data-answer-distribution]').nth(1).hover();
  await teacher.locator('[data-answer-distribution]').nth(1).focus();
  await teacher.mouse.move(0, 0);
  await teacher.getByRole("button", { name: "仅已作答学生", exact: true }).focus();
  await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).hover();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).isVisible(), true, "entering the list cancels all pending dismissals");
  await teacher.getByRole("button", { name: "关闭学生名单", exact: true }).click();
  await teacher.getByRole("button", { name: "仅已作答学生", exact: true }).click();
  await student.locator('[data-judgment="incorrect"]').first().waitFor({ timeout: 15000 });
  assert.equal(await late.locator('[data-judgment]').count(), 0, "unsubmitted peer must not receive results");
  assert.equal(await none.locator('[data-judgment]').count(), 0);
  await late.locator('input[type="radio"]').first().check(); await late.getByRole("button", { name: "提交答案", exact: true }).click();
  await late.locator('[data-judgment="correct"]').first().waitFor({ timeout: 15000 });
  await teacher.getByRole("button", { name: "全体学生（结束作答）", exact: true }).click();
  await none.locator('[data-judgment="unanswered"]').first().waitFor({ timeout: 15000 });
  await none.screenshot({ path: path.join(output, "unanswered-results-mobile.png") });
  const activity = await h.db.classroomActivity.findFirstOrThrow({ where: { sessionId: h.lesson.id } });
  const detail = await h.api.activityDetail(h.actor("student"), activity.id);
  assert.equal(detail.resultsVisible, true); assert.equal(detail.responses.length, 0); assert.equal(detail.roster, undefined);
  const text = await h.api.createActivity(h.actor("teacher"), { title: "Text statistics", kind: "quiz", definition: { questions: [{ id: "q", type: "shortText", prompt: "Fill x", points: 10, options: [], correct: ["x"] }] } }, crypto.randomUUID(), true);
  await h.api.commandActivity(h.actor("student"), text.id, { action: "answer", expectedVersion: 0, answers: { q: "x" } });
  await teacher.locator(`[data-activity-card="${text.id}"] [data-answer-distribution]`).waitFor({ timeout: 15000 });
  await teacher.setViewportSize({ width: 390, height: 844 });
  await teacher.locator(`[data-activity-card="${text.id}"] [data-answer-distribution]`).click();
  await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).waitFor();
  await teacher.evaluate(id => {
    const anchor = document.querySelector(`[data-activity-card="${id}"] [data-answer-distribution]`);
    anchor.style.transform = 'translateY(-40px)';
    document.dispatchEvent(new Event('scroll'));
  }, text.id);
  await teacher.waitForFunction(id => {
    const anchor = document.querySelector(`[data-activity-card="${id}"] [data-answer-distribution]`);
    const panel = document.querySelector('[role="region"][aria-label="选择此项的学生"]');
    if (!anchor || !panel) return false;
    const expected = Math.max(12, Math.min(innerHeight - 260, anchor.getBoundingClientRect().bottom + 6));
    return Math.abs(panel.getBoundingClientRect().top - expected) < 1;
  }, text.id);
  await teacher.evaluate(id => {
    const anchor = document.querySelector(`[data-activity-card="${id}"] [data-answer-distribution]`);
    anchor.style.transform = '';
    document.dispatchEvent(new Event('scroll'));
  }, text.id);
  await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).evaluate(panel => {
    const row = panel.querySelector('[class*="rosterRow"]');
    if (!row) throw new Error("Missing student row");
    for (let i = 0; i < 10; i++) panel.appendChild(row.cloneNode(true));
  });
  await teacher.setViewportSize({ width: 320, height: 480 });
  await teacher.waitForFunction(() => {
    const panel = document.querySelector('[role="region"][aria-label="选择此项的学生"]');
    if (!panel) return false;
    const box = panel.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
  });
  assert.equal(await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).evaluate(panel => {
    const box = panel.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && panel.scrollHeight > panel.clientHeight;
  }), true, "long student lists remain within the viewport and scroll after resizing");
  await teacher.getByRole("region", { name: "选择此项的学生", exact: true }).evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  assert.equal(await teacher.getByRole("button", { name: "关闭学生名单", exact: true }).evaluate(button => {
    const box = button.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  }), true, "close control stays visible after scrolling a long list");
  await teacher.screenshot({ path: path.join(output, "teacher-text-statistics-mobile.png") });
  assert.equal(await teacher.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, "checks.json"), JSON.stringify({ passed: true, pendingMs, teacherSyncMs, createAttempts: requests.length, versionChecks: revisions.length, checks: ["manual single/multiple option add/remove", "wrong AI type rejected", "immediate pending publication", "lost acknowledgement idempotency", "immediate answer feedback", "no-RTM teacher answer sync before student acknowledgement", "choice hover identities and correctness bubble", "submitted-only key privacy and late submit", "everyone release for unsubmitted students", "short-text statistics and mobile bounds"], boundary: "Actual React and PostgreSQL, delayed HTTP and dropped publication response, no RTM events; synthetic login boundaries; no production data" }, null, 2));
  console.log("PASS weak-network activity publication, answers, statistics and scoped results in desktop/mobile Chromium", { pendingMs, createAttempts: requests.length });
}
main().then(async () => { await browser?.close(); server?.close(); await harness?.close(); process.exit(0); }, async error => { console.error(error); await debug().catch(()=>{}); await browser?.close(); server?.close(); await harness?.close(); process.exit(1); });
