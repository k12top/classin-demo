const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { app, BrowserWindow } = require("electron");
const esbuild = require("esbuild");
const { openHarness } = require("./activity-harness.cjs");
const root = path.resolve(__dirname, "../..");
const temp = require("node:fs").mkdtempSync(path.join(os.tmpdir(), "classroom-activities-smoke-"));
app.setPath("userData", temp); app.on("window-all-closed", () => undefined);
let server, h, failStudentDetail = 0, delayStudentAnswer = false, loseStudentAnswerResponse = false; const windows = []; const checks = []; const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(win, expression) {
  const end = Date.now() + 18000;
  while (Date.now() < end) { const result = await win.webContents.executeJavaScript(expression); if (result) return result; await sleep(100); }
  console.error(await win.webContents.executeJavaScript("document.body.innerText"));
  throw new Error("Timed out: " + expression);
}
async function button(win, text) {
  await until(win, `Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled)`);
  return win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled).click()`, true);
}
async function field(win, selector, value) {
  return win.webContents.executeJavaScript(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('Field missing'); const prototype = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); })()`, true);
}
async function run() {
  h = await openHarness();
  const bundle = await esbuild.build({ entryPoints: [path.join(root, "tests/fixtures/activities.tsx")], bundle: true, write: false, outfile: "app.js", format: "esm", platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json") });
  const js = bundle.outputFiles.find(f => f.path.endsWith(".js")).contents, css = bundle.outputFiles.find(f => f.path.endsWith(".css")).contents;
  const globals = (await fs.readFile(path.join(root, "src/app/globals.css"), "utf8")).replace(/^@(?:import|tailwind).*;$/gm, "");
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/app.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); return; }
      if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(globals + "\n" + Buffer.from(css).toString()); return; }
      if (url.pathname.startsWith("/api/sessions/")) {
        const user = /activityActor=student/.test(req.headers.cookie || "") ? "student" : "teacher";
        const actor = h.actor(user), pieces = url.pathname.split("/"), id = pieces[6];
        if (req.method === "GET") {
          if (user === "student" && id && id !== "presentation" && failStudentDetail > 0) { failStudentDetail--; throw Object.assign(new Error("Temporary refresh failure"), { status: 503 }); }
          let data;
          if (id === "presentation") data = { presentation: await h.api.activityPresentation(h.lesson.id) };
          else if (id) data = await h.api.activityDetail(actor, id, url.searchParams.get("cursor"));
          else data = await h.api.listActivities(actor, url.searchParams.get("cursor"));
          res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); return;
        }
        const chunks = []; for await (const c of req) chunks.push(c); const body = JSON.parse(Buffer.concat(chunks));
        if (user === "student" && body.action === "answer" && delayStudentAnswer) { delayStudentAnswer = false; await sleep(700); }
        const data = req.method === "POST" ? await h.api.createActivity(actor, body.activity, body.requestId) : await h.api.commandActivity(actor, id, body);
        if (user === "student" && body.action === "answer" && loseStudentAnswerResponse) { loseStudentAnswerResponse = false; throw Object.assign(new Error("Lost answer response after save"), { status: 503 }); }
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); return;
      }
      const student = url.pathname.startsWith("/student"); res.setHeader("Set-Cookie", `activityActor=${student ? "student" : "teacher"}; Path=/; HttpOnly; SameSite=Strict`);
      res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"><link rel="stylesheet" href="/style.css"><style>body{margin:0}*{box-sizing:border-box}</style><div id="root"></div><script type="module" src="/app.js"></script></html>`);
    } catch (e) { res.statusCode = e.status || 500; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: e.message })); }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const make = async role => { const win = new BrowserWindow({ width: 1180, height: 820, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, partition: "activity-" + role } }); windows.push(win); win.webContents.on("console-message", (_e, ...args) => console.log("renderer", ...args)); await win.loadURL(`${base}/${role}?lang=zh-CN&sessionId=${h.lesson.id}`); return win; };
  const teacher = await make("teacher"), student = await make("student");
  teacher.webContents.on("console-message", (_e, ...args) => console.log("renderer", ...args));
  await button(teacher, "创建活动");
  await teacher.webContents.executeJavaScript(`(() => { const e=document.querySelector('form select'); e.value='quiz'; e.dispatchEvent(new Event('change',{bubbles:true})); })()`, true);
  await field(teacher, 'form > label:first-of-type input', "知识检查");
  await field(teacher, 'fieldset textarea', "地球围绕什么公转？");
  await field(teacher, 'input[aria-label="选项 1"]', "太阳"); await field(teacher, 'input[aria-label="选项 2"]', "月球");
  await teacher.webContents.executeJavaScript(`document.querySelector('input[aria-label="正确答案 1"]').click()`, true);
  await button(teacher, "添加题目");
  await teacher.webContents.executeJavaScript(`(() => { const e=document.querySelectorAll('fieldset > select')[1]; e.value='essay'; e.dispatchEvent(new Event('change',{bubbles:true})); })()`, true);
  await field(teacher, 'fieldset:nth-of-type(2) textarea', "说明你的理由。");
  await button(teacher, "保存草稿");
  await button(teacher, "发布给学生");
  await until(student, `Array.from(document.querySelectorAll('nav button')).some(b=>b.textContent.includes('知识检查'))`);
  await student.webContents.executeJavaScript(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('知识检查')).click()`, true);
  await until(student, `document.querySelector('form input[type=radio]')`);
  await student.webContents.executeJavaScript(`document.querySelector('form input[type=radio]').click()`, true);
  await field(student, 'form textarea', "因为太阳的引力。");
  failStudentDetail = 1;
  await button(student, "提交答案");
  await until(student, `document.body.textContent.includes('答案已保存')`);
  await until(student, `document.body.textContent.includes('Temporary refresh failure')`);
  assert.equal(await student.webContents.executeJavaScript(`document.querySelector('form textarea').value`), "因为太阳的引力。");
  checks.push("successful answer acknowledgement remains visible when the following refresh fails");
  const studentData = await student.webContents.executeJavaScript(`fetch('/api/sessions/${h.lesson.id}/classroom/activities').then(r=>r.json()).then(async l=>({list:l,detail:await fetch('/api/sessions/${h.lesson.id}/classroom/activities/'+l.active.id).then(r=>r.json())}))`);
  assert.equal("correct" in studentData.detail.definition.questions[0], false); assert.equal(studentData.detail.ownResponse.grading, null);
  checks.push("actual React draft editor, two quiz types, teacher publish and student saved answers");
  await until(student, `document.querySelector('[data-activity-presentation]')?.textContent.includes('地球')`);
  assert.equal(await student.webContents.executeJavaScript(`document.querySelector('[data-activity-presentation]').textContent.includes('正确答案')`), false);
  await field(student, 'form textarea', "本地未提交的修改");
  await h.api.commandActivity(h.actor("student"), studentData.detail.id, { action: "answer", expectedVersion: studentData.detail.ownResponse.version, answers: { ...studentData.detail.ownResponse.answers, [studentData.detail.definition.questions[1].id]: "另一设备保存的答案" } });
  await student.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('classroom-activity-refresh',{detail:{sessionId:'${h.lesson.id}'}}))`);
  await until(student, `document.body.textContent.includes('已保存的答案已更新')`);
  assert.equal(await student.webContents.executeJavaScript(`document.querySelector('form textarea').value`), "本地未提交的修改");
  await button(student, "更新答案");
  await until(student, `document.querySelector('[role=alert]')?.textContent.includes('已保存的答案已更新')`);
  assert.equal(await student.webContents.executeJavaScript(`document.querySelector('form textarea').value`), "本地未提交的修改");
  await student.webContents.executeJavaScript("void (window.confirm=()=>true)");
  await button(student, "加载保存的答案");
  await until(student, `document.querySelector('form textarea').value==='另一设备保存的答案'`);
  await field(student, 'form textarea', "因为太阳的引力。");
  delayStudentAnswer = true; loseStudentAnswerResponse = true;
  await button(student, "更新答案");
  await until(student, `Array.from(document.querySelectorAll('nav button')).every(b=>b.disabled) && document.querySelector('form button[type=submit]').disabled`);
  await until(student, `document.body.textContent.includes('答案已保存') && !document.querySelector('form button[type=submit]').disabled`);
  checks.push("two-device answer conflict retains local edits, explicit reload recovers, selection is locked while saving");
  checks.push("a lost answer response is confirmed through a server read without discarding saved input");
  await field(student, 'form textarea', "截止时仍未提交的修改");
  await teacher.webContents.executeJavaScript("void (window.confirm=()=>true)");
  await button(teacher, "停止作答");
  await until(student, `document.body.textContent.includes('这些修改未提交')`);
  assert.equal(await student.webContents.executeJavaScript(`document.querySelector('form textarea').value`), "截止时仍未提交的修改");
  assert.equal(await student.webContents.executeJavaScript(`document.querySelector('form textarea').readOnly`), true);
  assert.ok(await student.webContents.executeJavaScript(`document.body.textContent.includes('因为太阳的引力')`));
  checks.push("closing retains a readable unsubmitted draft alongside the authoritative saved answer");
  await button(teacher, "公布结果");
  await until(teacher, `document.querySelector('[role=alert]')?.textContent.includes('请先完成所有主观题')`);
  await until(teacher, `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('student') && b.textContent.includes('待批改'))`);
  await teacher.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('student') && b.textContent.includes('待批改')).click()`, true);
  const activity = (await h.api.listActivities(h.actor("teacher"))).activities[0];
  const gradeDetail = await h.api.activityDetail(h.actor("teacher"), activity.id);
  const oldGrade = gradeDetail.responses[0];
  await h.api.commandActivity(h.actor("teacher"), activity.id, { action: "grade", responseId: oldGrade.id, expectedVersion: oldGrade.version, grading: Object.fromEntries(gradeDetail.definition.questions.map((q, i) => [q.id, i ? 6 : 10])), feedback: "Concurrent teacher grade" });
  await field(teacher, 'article form input[type=number]:nth-of-type(1)', "10");
  const gradeInputs = await teacher.webContents.executeJavaScript(`document.querySelectorAll('article form input[type=number]').length`); assert.equal(gradeInputs, 2);
  await teacher.webContents.executeJavaScript(`(() => { const e=document.querySelectorAll('article form input[type=number]')[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'8');e.dispatchEvent(new Event('input',{bubbles:true})); })()`, true);
  await field(teacher, 'article form textarea', "解释清楚，再补充轨道形状。");
  await button(teacher, "保存评分");
  await until(teacher, `document.querySelector('[role=alert]')?.textContent.includes('评分已被其他教师修改')`);
  await button(teacher, "重新加载最新评分");
  await teacher.webContents.executeJavaScript(`(() => { const e=document.querySelectorAll('article form input[type=number]')[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'8');e.dispatchEvent(new Event('input',{bubbles:true})); })()`, true);
  await field(teacher, 'article form textarea', "解释清楚，再补充轨道形状。");
  await button(teacher, "保存评分"); await button(teacher, "公布结果");
  checks.push("concurrent teacher grading conflict retains edits and offers latest-grade recovery");
  await until(student, `document.body.textContent.includes('得分：18 / 20')`);
  await until(student, `document.body.textContent.includes('解释清楚')`);
  checks.push("server publication gate, manual grading, private score and feedback publication");
  await teacher.webContents.executeJavaScript(`(() => {const e=Array.from(document.querySelectorAll('select')).find(s=>s.closest('label')?.textContent.includes('舞台展示题目'));e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));})()`, true);
  await until(student, `document.querySelector('[data-activity-presentation]')?.textContent.includes('说明你的理由')`);
  assert.equal(await student.webContents.executeJavaScript(`document.querySelector('[data-activity-presentation]').textContent.includes('解释清楚')`), false);
  checks.push("shared stage question navigation with no personal answer or feedback disclosure");
  await h.db.classroomRuntime.update({ where: { id: h.runtime.id }, data: { status: "ended" } });
  await student.loadURL(`${base}/student-review?lang=zh-CN&sessionId=${h.lesson.id}`);
  await until(student, `Array.from(document.querySelectorAll('nav button')).some(b=>b.textContent.includes('知识检查'))`);
  await student.webContents.executeJavaScript(`document.querySelector('nav button').click()`, true);
  await until(student, `document.body.textContent.includes('得分：18 / 20')`);
  await teacher.loadURL(`${base}/teacher-review?lang=zh-CN&sessionId=${h.lesson.id}`);
  await until(teacher, `document.body.textContent.includes('知识检查')`); await teacher.webContents.executeJavaScript(`document.querySelector('nav button').click()`, true);
  await until(teacher, `document.body.textContent.includes('选项统计')`);
  const dir = path.join(__dirname, "../dist/verification"); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "activities-teacher.png"), (await teacher.webContents.capturePage()).toPNG());
  await fs.writeFile(path.join(dir, "activities-student.png"), (await student.webContents.capturePage()).toPNG());
  await student.setContentSize(390, 844); await sleep(200);
  const geometry = await student.webContents.executeJavaScript(`({width:innerWidth,body:document.documentElement.scrollWidth,inputs:Array.from(document.querySelectorAll('input,select,textarea,button')).filter(e=>e.getBoundingClientRect().width>0).every(e=>e.getBoundingClientRect().right<=innerWidth+1)})`);
  assert.ok(geometry.body <= geometry.width + 1); assert.equal(geometry.inputs, true);
  await fs.writeFile(path.join(dir, "activities-mobile.png"), (await student.webContents.capturePage()).toPNG());
  checks.push("reloaded after-class teacher/student results and 390px responsive layout");
  const report = { passed: true, mode: "actual React UI + production activity service + isolated PostgreSQL16 in macOS Electron; local HTTP harness supplies authenticated actors", electron: process.versions.electron, checks, geometry };
  await fs.writeFile(path.join(dir, "activities-smoke.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}
async function cleanup() { windows.forEach(w => { if (!w.isDestroyed()) w.destroy(); }); server?.close(); await h?.close(); await fs.rm(temp, { recursive: true, force: true }); }
app.whenReady().then(run).then(async () => { await cleanup(); app.exit(0); }).catch(async e => { console.error(e); await cleanup(); app.exit(1); });
