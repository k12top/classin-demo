/* eslint-disable @typescript-eslint/no-require-imports -- Actual settings/reminder/scheduler in Chromium; HTTP persistence and media readiness are simulated. */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict"), esbuild = require("esbuild");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../.."), cache = path.join(root, "node_modules/.cache/class-start-ui"), output = path.join(root, "outputs/classroom-start-2026-10-18");
let win, server;
async function main() {
  await fs.mkdir(cache, { recursive: true }); await fs.mkdir(output, { recursive: true });
  const bundle = await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState,useCallback,useEffect}from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';
    import{DeviceSettings}from'@/components/classroom/classroom-v3';import{ClassStartReminder}from'@/components/classroom/class-start-controls';import{useScheduledClassStart}from'@/components/classroom/use-scheduled-class-start';import{classStartReadiness}from'@/lib/classroom/class-start';
    const noop=()=>{},media={participants:[],connectionState:'connected',network:{uplinkQuality:1,downlinkQuality:1,latencyMs:20,packetLossPercent:0},local:{microphoneOn:false,cameraOn:false,screenSharing:false,videoQuality:'hd'}};
    function Fixture(){const[settings,setSettings]=useState(false),[mode,setMode]=useState('manual'),[recording,setRecording]=useState('classStart'),[role,setRole]=useState('teacher'),[status,setStatus]=useState('waiting'),[ready,setReady]=useState(true),[rtc,setRtc]=useState(true),[page,setPage]=useState(true),[recorder,setRecorder]=useState(false),[start,setStart]=useState(Date.now()+60000),[now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false);
      useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),80);return()=>clearInterval(timer)},[]);
      const runtime={classStartMode:mode,recordingStartMode:recording,status,revision:1,members:[],assistantPermissions:{}};
      const action=useCallback(async value=>{setBusy(true);const response=await fetch('/actions',{method:'POST',body:JSON.stringify(value)});setBusy(false);if(!response.ok)return false;if(value.type==='setClassStartMode')setMode(value.mode);if(value.type==='setRecordingStartMode')setRecording(value.mode);if(value.type==='startClass'||value.type==='startScheduledClass')setStatus('live');return true},[]);
      const auto=useCallback(()=>action({type:'startScheduledClass'}),[action]);
      useScheduledClassStart({enabled:mode==='scheduled'&&status==='waiting'&&classStartReadiness({isTeacher:role==='teacher',isRecorder:recorder,pageReady:page,mediaConnected:rtc,whiteboardRequired:true,whiteboardReady:ready}),startTime:new Date(start).toISOString(),endTime:new Date(start+3600000).toISOString(),clockOffset:0,onStart:auto});
      window.fixture={setRole,setReady,setRtc,setPage,setRecorder,setRecording,setMode,setStatus,setSettings,setStart:value=>setStart(Date.now()+value),state:()=>({mode,recording,role,status,busy})};
      return <main className="classroom-v3-shell is-classin-layout fixture"><header className="classroom-v3-topbar"><h1>数学 · 二次方程</h1><span>准备室</span><button className="is-start" onClick={()=>action({type:'startClass'})}>开始上课</button><button onClick={()=>setSettings(true)}>设置</button></header><section className="classroom-v3-stage"><p>课堂画面</p></section>{!recorder&&!settings&&<ClassStartReminder role={role} status={status} mode={mode} startTime={new Date(start).toISOString()} endTime={new Date(start+3600000).toISOString()} now={now} busy={busy} onStart={()=>action({type:'startClass'})} onSettings={()=>setSettings(true)}/>}
      <DeviceSettings open={settings} theme="light" onThemeChange={noop} provider={null} media={media} runtime={runtime} canManageRecording={role==='teacher'} onAssistantPermission={noop} captionDisplayMode="bilingual" captionBackgroundMode="text" captionBackgroundColor="#202124" focusClassStart={true} startSettingsBusy={busy} onClassStartModeChange={mode=>action({type:'setClassStartMode',mode})} onRecordingStartModeChange={mode=>action({type:'setRecordingStartMode',mode})} onCaptionDisplayModeChange={noop} onCaptionBackgroundModeChange={noop} onCaptionBackgroundColorChange={noop} onClose={()=>setSettings(false)}/></main>;
    }createRoot(document.getElementById('root')).render(<I18nProvider><Fixture/></I18nProvider>);
  ` }, outfile: path.join(cache, "fixture.js"), bundle: true, write: false, platform: "browser", format: "iife", tsconfig: path.join(root, "tsconfig.json"), define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, plugins: [{ name: "expose-settings", setup(build) { build.onLoad({ filter: /classroom-v3\.tsx$/ }, async ({ path: file }) => ({ contents: await fs.readFile(file, "utf8") + "\nexport { DeviceSettings };", loader: "tsx" })); } }] });
  const cssPath = path.join(cache, "tailwind.css");
  execFileSync("node", [require.resolve("tailwindcss/lib/cli.js"), "-i", path.join(root, "src/app/globals.css"), "-o", cssPath], { cwd: root, stdio: "ignore" });
  const css = [await fs.readFile(cssPath, "utf8"), await fs.readFile(path.join(root, "src/app/classroom-classin.css"), "utf8"), await fs.readFile(path.join(root, "src/app/classroom-light.css"), "utf8"), bundle.outputFiles.find(f => f.path.endsWith(".css")).text].join("\n");
  const requests = []; let failures = 0;
  server = http.createServer(async (request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); return response.end(bundle.outputFiles.find(f => f.path.endsWith(".js")).text); }
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); return response.end(css); }
    if (request.url === "/actions") { let body = ""; for await (const chunk of request) body += chunk; const value = JSON.parse(body); requests.push(value); await new Promise(resolve => setTimeout(resolve, 150)); response.setHeader("Content-Type", "application/json"); if (failures) { failures--; return response.writeHead(503).end('{}'); } return response.end('{}'); }
    response.end('<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>.fixture .classroom-v3-topbar{display:flex;gap:16px}.fixture .classroom-v3-topbar h1{flex:1;font-size:16px}.fixture .classroom-v3-stage{min-height:85vh;background:#f6f7fb;padding:32px}.fixture .classroom-v3-topbar button{padding:8px}</style><div id="root"></div><script src="/fixture.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); await app.whenReady();
  win = new BrowserWindow({ show: false, width: 1440, height: 1050, webPreferences: { backgroundThrottling: false, partition: 'class-start-' + Date.now() } });
  const errors = []; win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/?lang=zh-CN`);
  const run = code => win.webContents.executeJavaScript(code);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async code => { const deadline = Date.now() + 12000; while (!await run(`Boolean(${code})`)) { if (Date.now() > deadline) throw new Error(`timeout: ${code}; ${errors.join(';')}`); await pause(35); } };
  const select = 'select[aria-label="开课方式"]', recording = 'select[aria-label="课堂录制"]', reminder = 'aside[aria-label="已到上课时间"]';
  const change = async (selector, value) => { await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`); await wait("!fixture.state().busy"); };
  const shot = async name => { await fs.writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  await wait("!!window.fixture"); assert.equal(await run(`!!document.querySelector(${JSON.stringify(reminder)})`), false);
  await run("fixture.setStart(-125000)"); await wait(`!!document.querySelector(${JSON.stringify(reminder)})`);
  assert.ok(await run(`document.querySelector(${JSON.stringify(reminder)}).textContent.includes('2 分钟')`)); assert.equal(requests.length, 0, "default reminders never start class"); await shot('reminder-desktop');
  await run(`document.querySelector(${JSON.stringify(reminder)}).querySelector('button').click()`); await wait(`document.querySelector(${JSON.stringify(select)})`); await pause(350);
  assert.equal(await run(`document.querySelector(${JSON.stringify(select)}).value`), 'manual');
  assert.equal(await run(`document.querySelector(${JSON.stringify(select)}).closest('fieldset')===document.querySelector(${JSON.stringify(recording)}).closest('fieldset')`), false);
  await run("fixture.setReady(false)"); await change(recording, 'disabled'); await change(select, 'scheduled');
  await wait("fixture.state().mode==='scheduled'&&fixture.state().recording==='disabled'");
  assert.equal(requests.filter(a => a.type === 'startScheduledClass').length, 0);
  await run(`document.querySelector(${JSON.stringify(select)}).closest('fieldset').scrollIntoView({block:'start'})`); await pause(100); await shot('settings-desktop');
  win.setContentSize(390, 844); await wait("innerWidth===390"); await run(`document.querySelector(${JSON.stringify(select)}).closest('fieldset').scrollIntoView({block:'start'})`); await pause(100); await shot('settings-mobile');
  assert.ok(await run(`(()=>{const r=document.querySelector(${JSON.stringify(select)}).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`), 'class-start setting fits narrow screens');
  await run("fixture.setSettings(false)"); await wait(`!document.querySelector(${JSON.stringify(select)})`); await shot('reminder-mobile');
  for (const role of ['student','assistant']) { await run(`fixture.setRole(${JSON.stringify(role)});fixture.setSettings(true)`); await pause(200); assert.equal(await run(`!!document.querySelector(${JSON.stringify(select)})`), false); await run('fixture.setSettings(false)'); await pause(100); assert.equal(await run(`!!document.querySelector(${JSON.stringify(reminder)})`), role==='assistant'); }
  await run("fixture.setRole('teacher');fixture.setRtc(false);fixture.setReady(true)"); await pause(250); assert.equal(requests.filter(a=>a.type==='startScheduledClass').length,0);
  await run("fixture.setRtc(true);fixture.setPage(false)"); await pause(250); assert.equal(requests.filter(a=>a.type==='startScheduledClass').length,0);
  await run("fixture.setRecorder(true);fixture.setPage(true)"); await pause(250); assert.equal(requests.filter(a=>a.type==='startScheduledClass').length,0);
  await run("fixture.setStart(500);fixture.setRecorder(false)"); await pause(200); assert.equal(requests.filter(a=>a.type==='startScheduledClass').length,0,'never before schedule');
  await wait("fixture.state().status==='live'"); assert.equal(requests.filter(a=>a.type==='startScheduledClass').length,1); assert.equal(await run("fixture.state().recording"),'disabled');
  await wait(`!document.querySelector(${JSON.stringify(reminder)})`);
  // A late teacher retries a transient failure and stops scheduling after success.
  failures = 1; await run("fixture.setStart(-60000);fixture.setStatus('waiting')");
  await wait("fixture.state().status==='live'"); assert.equal(requests.filter(a=>a.type==='startScheduledClass').length,3);
  const count = requests.length; await pause(250); assert.equal(requests.length,count);
  await run("fixture.setSettings(true)"); await wait(`document.querySelector(${JSON.stringify(select)}).disabled`);
  for (const [language, title, recordingTitle] of [['en','Class start','Class recording'],['zh-TW','開課方式','課堂錄製']]) {
    await change('select[aria-label="界面语言"],select[aria-label="Interface language"]',language);
    await wait(`document.querySelector('select[aria-label="${title}"]')`);
    assert.ok(await run(`!!document.querySelector('select[aria-label="${recordingTitle}"]')`));
  }
  assert.deepEqual(errors, []);
  console.log('PASS production settings/reminder/scheduler: default reminder, late hint, separate settings, lead-only controls, readiness/RTC/loading/recorder guards, exact timer threshold, recording disabled, retry, live cleanup, desktop/mobile layout. Persistence and media are simulated.');
}
main().then(() => cleanup(0), error => { console.error(error); cleanup(1); });
function cleanup(code) { win?.destroy(); server?.close(); app.exit(code); }
