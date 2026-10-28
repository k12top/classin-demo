/* eslint-disable @typescript-eslint/no-require-imports -- Browser reload/localStorage acceptance. */
// Run: clients/desktop/node_modules/.bin/electron tests/integration/classroom-caption-outbox-browser.cjs
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
let window, server;
async function main() {
  const bundle = await esbuild.build({ stdin: { contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {AuthProvider} from '@/lib/auth-context';
    import {createCaptionPersistenceQueue} from '@/lib/classroom/caption-persistence';
    import {createCaptionOutbox} from '@/lib/classroom/caption-outbox';
    import {deliverClassroomCaption} from '@/lib/classroom/caption-delivery';
    const queue=createCaptionPersistenceQueue(value=>deliverClassroomCaption('lesson',value),()=>{},60000,
      {store:createCaptionOutbox(localStorage,'teacher','lesson','classroom-tab')});
    window.fixture={queue,enqueue(extra={}){queue.enqueue({id:'sentence',text:'Speech received before disconnect',
      speakerId:'teacher',speakerName:'Teacher',sourceLanguage:'en-US',detectedLanguage:'en-US',
      translations:{'zh-CN':'断线前的字幕'},isFinal:false,occurredAt:new Date().toISOString(),...extra})}};
    const user={userId:'teacher',name:'teacher',displayName:'Teacher',role:'teacher',avatar:'',email:''};
    createRoot(document.getElementById('root')).render(<AuthProvider initialUser={user}><div>Caption delivery fixture</div></AuthProvider>);
  `, resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", tsconfig: path.join(root, "tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' } });
  let mode = "offline";
  const received = [], rows = new Map();
  server = http.createServer(async (request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); return; }
    if (request.url.includes("/classroom/captions")) {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const { caption } = JSON.parse(Buffer.concat(chunks).toString());
      received.push(caption);
      if (mode === "offline") { response.writeHead(503).end('{"error":"offline"}'); return; }
      if (mode === "ignored") { response.end('{"ignored":true}'); return; }
      rows.set(caption.id, caption); response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ caption: { ...caption, provider: "shengwang", createdAt: new Date().toISOString() }, revision: 1 })); return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await app.whenReady();
  window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const run = code => window.webContents.executeJavaScript(code);
  const waitFor = async predicate => {
    const until = Date.now() + 15_000;
    while (!await predicate()) {
      if (Date.now() > until) throw Error("Browser caption recovery timed out");
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const pending = "Object.keys(localStorage).filter(key=>key.startsWith('classroom-caption-outbox:v1:')).length";
  await window.loadURL(origin);
  await waitFor(() => run("Boolean(window.fixture)"));
  await run("fixture.enqueue();fixture.queue.flush()");
  assert.equal(await run(pending), 1); assert.equal(rows.size, 0);
  await run("fixture.queue.dispose()");
  mode = "ignored";
  await window.loadURL(origin + "/courses/lesson/playback");
  await waitFor(() => run("Boolean(window.fixture)"));
  await waitFor(() => received.length >= 2);
  assert.equal(await run(pending), 1, "a 200 ignored response must not clear browser storage");
  mode = "online";
  await run("window.dispatchEvent(new Event('online'))");
  await waitFor(async () => await run(pending) === 0);
  assert.equal(rows.size, 1); assert.equal(rows.get("sentence").isFinal, false);
  assert.equal(rows.get("sentence").translations["zh-CN"], "断线前的字幕");
  console.log("PASS real browser partial-only subtitles survive failed requests, page reload and navigation; AuthProvider retries after online without reopening class");
  console.log("PASS a successful HTTP status without a caption acknowledgement preserves the durable browser copy");
  assert.ok(received.length >= 3);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  window?.destroy(); if (server) await new Promise(resolve => server.close(resolve)); app.quit();
});
