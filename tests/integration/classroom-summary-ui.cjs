/* eslint-disable @typescript-eslint/no-require-imports -- Electron checks the production playback page with simulated HTTP APIs. */
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
let window, server;

async function main() {
  const stubs = {
    "next/navigation": "const router={push(){},replace(){},back(){}};export const useRouter=()=>router;",
    "@/lib/auth-context": "const user={userId:'teacher',displayName:'王老师',name:'teacher',role:'teacher'};export const useAuth=()=>({user,loading:false,logout(){}});",
    "@/components/portal/portal-shell": "import React from 'react';export const PortalShell=({children})=><main style={{maxWidth:1400,margin:'auto',padding:16}}>{children}</main>;",
  };
  const bundle = await esbuild.build({ stdin: { contents: `
    import React,{Suspense} from 'react';import{createRoot}from'react-dom/client';
    import PlaybackPage from '@/app/courses/[id]/playback/page';import{I18nProvider}from'@/lib/i18n/context';
    const params=Promise.resolve({id:'test-course'}),search=Promise.resolve({});
    window.pageIdentity=crypto.randomUUID();
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Suspense fallback={<p>Loading</p>}><PlaybackPage params={params} searchParams={search}/></Suspense></I18nProvider>);
  `, resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "framework-boundaries", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "stub" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
    build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: "export default {};", loader: "js" }));
  } }] });
  let cssPath = process.env.SUMMARY_UI_CSS;
  if (!cssPath) {
    cssPath = path.join(root, "node_modules/.cache/classroom-summary-ui.css");
    await fs.mkdir(path.dirname(cssPath), { recursive: true });
    execFileSync("node", [require.resolve("tailwindcss/lib/cli.js"), "-i", path.join(root, "src/app/globals.css"), "-o", cssPath, "--minify"], { cwd: root, stdio: "pipe" });
  }
  const css = await fs.readFile(cssPath, "utf8");
  let summary = null, generation = null, ensureRequests = 0, manualRequests = 0, manualRuns = 0, transientReads = 0;
  let failNextMetadataRead = false;
  const finish = overview => {
    const now = new Date().toISOString();
    summary = { id: "summary", sessionId: "lesson", status: "draft", generatedBy: "system", captionCount: 1, sourceUpdatedAt: now, generatedAt: now, publishedAt: null, updatedAt: now, isStale: false,
      document: { title: "方程复习", overview, keyPoints: ["先整理已知条件，再选择解法。"], questions: [], actionItems: [], speakers: [], generation: { method: "meeting-multi-agent", analyzedCaptionCount: 1, totalCaptionCount: 1 }, report: { participantSummaries: [], discussionThreads: [], actionItems: [], conclusions: [], followUps: [] } } };
    generation = { ...generation, status: "completed" };
  };
  server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const json = (body, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
    if (url.pathname === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); return; }
    if (url.pathname === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); return; }
    if (url.pathname === "/api/courses/test-course") return json({ course: { id: "test-course", name: "课后总结验证", teacherName: "王老师", status: "finished", canTeach: true } });
    if (url.pathname === "/api/courses/test-course/sessions") return json({ sessions: [{ id: "lesson", title: "方程复习", status: "finished", startTime: "2026-10-17T01:00:00Z", endTime: "2026-10-17T02:00:00Z", _count: { recordings: 0 } }] });
    if (url.pathname === "/api/sessions/lesson/recordings") return json({ recordings: [] });
    if (url.pathname === "/api/sessions/lesson/summary") {
      if (request.method === "POST") {
        let input = ""; for await (const chunk of request) input += chunk;
        const { action } = JSON.parse(input);
        if (action === "ensure") {
          ensureRequests++;
          generation = { status: "queued", requestId: "automatic", error: null };
          failNextMetadataRead = true;
          setTimeout(() => finish("课堂结束后自动生成的总结，无需手动点击。"), 500);
          return json({ summary, generation }, 202);
        }
        if (action === "generate") {
          manualRequests++;
          if (generation?.status !== "running") {
            manualRuns++;
            generation = { status: "running", requestId: "manual", error: null };
            setTimeout(() => finish("重新生成已完成，页面自动更新，无需刷新。"), 500);
          }
          // The server queued the task, but the submit response was lost.
          response.destroy(); return;
        }
      }
      if (url.searchParams.has("summaryOnly")) {
        if (failNextMetadataRead) { failNextMetadataRead = false; transientReads++; return json({ error: "Temporary proxy failure" }, 502); }
        return json({ summary, generation, canManage: true });
      }
      return json({ summary, generation, canManage: true, captions: [{ id: "c1", speakerName: "王老师", text: "今天我们复习方程，先整理已知条件再求解。", translations: {}, occurredAt: "2026-10-17T01:01:00Z" }], nextCaptionCursor: null });
    }
    if (url.pathname.startsWith("/api/")) return json({});
    response.end('<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await app.whenReady();
  window = new BrowserWindow({ show: false, width: 1440, height: 1050, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  const errors = [];
  window.webContents.on("console-message", event => { if (event.level === "error" && !event.message.includes("Failed to load resource")) errors.push(event.message); });
  await window.loadURL(`http://127.0.0.1:${server.address().port}/courses/test-course/playback?sessionId=lesson&lang=zh-CN`);
  const run = code => window.webContents.executeJavaScript(code);
  const waitFor = async code => {
    const deadline = Date.now() + 20_000;
    while (!await run(code)) {
      if (Date.now() > deadline) throw new Error(`Browser timeout: ${code}; errors: ${errors.join(";")}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  await waitFor("document.body.textContent.includes('AI 总结正在生成')");
  await waitFor("document.body.textContent.includes('课堂结束后自动生成的总结，无需手动点击。')");
  assert.equal(ensureRequests, 1); assert.equal(manualRequests, 0); assert.equal(transientReads, 1);
  assert.equal(await run("document.querySelector('#lesson-summary [role=alert]')?.textContent || ''"), "");
  const pageIdentity = await run("window.pageIdentity");
  await run("Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('重新生成')).click()");
  await waitFor("document.body.textContent.includes('重新生成已完成，页面自动更新，无需刷新。')");
  assert.ok(manualRequests >= 1); // Chromium may retry the failed HTTP connection.
  assert.equal(manualRuns, 1);
  assert.equal(await run("window.pageIdentity"), pageIdentity, "the page was never reloaded");
  assert.equal(await run("document.querySelector('#lesson-summary [role=alert]')?.textContent || ''"), "", "no false error after the lost submission response");
  const output = path.join(root, "outputs/classroom-summary-fix-2026-10-17"); await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "desktop.png"), (await window.webContents.capturePage()).toPNG());
  window.setContentSize(390, 844);
  await waitFor("innerWidth===390");
  await run("document.getElementById('lesson-summary').scrollIntoView({block:'start'})");
  assert.ok(await run("document.documentElement.scrollWidth <= innerWidth"));
  await fs.writeFile(path.join(output, "mobile.png"), (await window.webContents.capturePage()).toPNG());
  assert.deepEqual(errors, []);
  console.log("PASS production playback page: automatic enqueue, generation progress, recovery from transient status failure and lost submit response, completed summary without refresh, desktop/mobile. HTTP APIs and model results are simulated.");
}
main().then(() => cleanup(0), error => { console.error(error); cleanup(1); });
function cleanup(code) { window?.destroy(); server?.close(); app.exit(code); }
