/* eslint-disable @typescript-eslint/no-require-imports -- Production board components and native Chromium input; persistence is simulated. */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http"), assert = require("node:assert/strict"), esbuild = require("esbuild");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../.."), cache = path.join(root, "node_modules/.cache/board-management");
const output = path.join(root, "outputs/classroom-board-management-2026-10-18");
let win, server;
async function main() {
  await fs.mkdir(cache, { recursive: true }); await fs.mkdir(output, { recursive: true });
  const bundle = await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';
    import{BoardCompositionLayer}from'@/components/classroom/classroom-v3';import{classroomCapabilities}from'@/lib/classroom/policy';
    import{emptyClassroomComposition,placeClassroomBoardItem,updateClassroomBoardItem}from'@/lib/classroom/composition';
    const initial=()=>placeClassroomBoardItem(emptyClassroomComposition(),{id:'camera:student',kind:'camera',sourceId:'student',visible:true,locked:false,shape:'rounded',rect:{x:.03,y:.03,width:.27,height:.3}});
    const members=[{userId:'student',displayName:'Mia',role:'student',rtcUids:[2]}],participants=[{id:'2',displayName:'Mia',kind:'camera',isLocal:false,hasVideo:false,hasAudio:false}];
    const provider={attachVideo(){},detachVideo(){}};
    function Fixture(){const[mode,setMode]=useState({role:'teacher',grant:false,recorder:false}),[composition,setComposition]=useState(initial),[revision,setRevision]=useState(1);
      window.fixture={setMode:(role,grant=false,recorder=false)=>setMode({role,grant,recorder}),reset:()=>{setComposition(initial());setRevision(n=>n+1)},remote:rect=>{setComposition(c=>updateClassroomBoardItem(c,'camera:student',{rect}));setRevision(n=>n+1)},large:()=>{setComposition(c=>updateClassroomBoardItem(c,'camera:student',{rect:{x:.05,y:.08,width:.72,height:.55}}));setRevision(n=>n+1)},state:()=>composition};
      const capabilities=classroomCapabilities(mode.role,undefined,mode.grant),currentUserId=mode.role==='student'?'student':mode.role;
      const action=async value=>{await fetch('/actions',{method:'POST',body:JSON.stringify(value)});setComposition(c=>value.type==='updateBoardItem'?updateClassroomBoardItem(c,value.itemId,value):value.type==='removeBoardItem'?{...c,boardItems:[]}:c);setRevision(n=>n+1);return true};
      return <main className={'classroom-v3-shell is-classin-layout fixture'+(mode.recorder?' is-recorder':'')}><header>{mode.role==='teacher'?'主讲老师':mode.role==='assistant'?'助教':'学生'} · 管理其他成员的视频窗口</header><section className="classroom-v3-stage"><div className="classroom-v3-stage-content"><div className="classroom-v3-stage-layer is-shared-board"><BoardCompositionLayer key={mode.role+mode.grant+mode.recorder} items={composition.boardItems} revision={revision} members={members} participants={participants} courseware={[]} provider={provider} canManage={capabilities.canManageStage} isRecorder={mode.recorder} currentUserId={currentUserId} onAction={action} onPreview={(itemId,rect)=>window.previews.push({itemId,rect})} hiddenItemIds={new Set()} onHideLocally={()=>{}}/></div></div></section></main>}
    window.previews=[];createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);
  ` }, bundle: true, write: false, outfile: path.join(cache, "fixture.js"), format: "iife", platform: "browser", define: { "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "private-board-component", setup(build) {
    build.onLoad({ filter: /classroom-v3\.tsx$/ }, async args => ({ contents: await fs.readFile(args.path, "utf8") + "\nexport {BoardCompositionLayer};", resolveDir: path.dirname(args.path), loader: "tsx" }));
  } }] });
  const cssFile = path.join(cache, "global.css");
  execFileSync("node", [require.resolve("tailwindcss/lib/cli.js"), "-i", path.join(root, "src/app/globals.css"), "-o", cssFile, "--minify"], { cwd: root, stdio: "pipe" });
  const styles = await fs.readFile(cssFile, "utf8") + "\n" + (await Promise.all(["classroom-classin.css", "classroom-light.css"].map(name => fs.readFile(path.join(root, "src/app", name), "utf8")))).join("\n") + "\n" + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text || "");
  const actions = [];
  server = http.createServer(async (request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); return response.end(bundle.outputFiles.find(file => file.path.endsWith(".js")).text); }
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); return response.end(styles); }
    if (request.url === "/actions") { let body = ""; for await (const part of request) body += part; actions.push(JSON.parse(body)); return response.end("{}"); }
    response.end(`<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui}.fixture{display:block!important;min-height:100dvh!important;padding:0!important}.fixture>header{padding:16px 24px;height:56px;background:white;color:#222}.fixture .classroom-v3-stage{position:absolute;inset:64px 12px 12px;display:block!important;min-height:0}.fixture .classroom-v3-stage-content,.fixture .classroom-v3-stage-layer{position:absolute;inset:0}.fixture .classroom-v3-board-composition{background:#f5f7fa}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); await app.whenReady();
  win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { backgroundThrottling: false, partition: "board-management-" + Date.now() } });
  const errors = []; win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  await win.loadURL(`http://127.0.0.1:${server.address().port}/?lang=zh-CN`);
  const run = async code => { try { return await win.webContents.executeJavaScript(code); } catch (error) { throw new Error(String(error) + "; code: " + code + "; renderer: " + errors.join("; ")); } };
  const pause = () => new Promise(resolve => setTimeout(resolve, 40));
  const wait = async code => { const end = Date.now() + 10000; while (!await run(code)) { if (Date.now() > end) throw Error("timeout " + code); await pause(); } };
  win.webContents.debugger.attach("1.3");
  const dispatch = (method, params) => win.webContents.debugger.sendCommand(method, params);
  const rect = selector => run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,left:r.left,top:r.top,width:r.width,height:r.height}})()`);
  const drag = async (selector, dx, dy, touch = false) => {
    const p = await rect(selector);
    if (touch) await dispatch("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
    else { await dispatch("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons: 0 }); await pause(); await dispatch("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 }); }
    for (let step = 1; step <= 8; step++) {
      const x = p.x + dx * step / 8, y = p.y + dy * step / 8;
      await dispatch(touch ? "Input.dispatchTouchEvent" : "Input.dispatchMouseEvent", touch ? { type: "touchMove", touchPoints: [{ x, y, id: 1 }] } : { type: "mouseMoved", x, y, buttons: 1 }); await pause();
    }
    if (touch) await dispatch("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await dispatch("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x + dx, y: p.y + dy, button: "left", buttons: 0, clickCount: 1 });
    await pause();
  };
  const click = selector => drag(selector, 0, 0);
  const item = ".classroom-v3-board-item", grip = "[data-board-drag-handle]", resize = ".classroom-v3-board-item-resize";
  const screenshot = async name => fs.writeFile(path.join(output, name + ".png"), (await win.webContents.capturePage()).toPNG());
  await wait(`!!document.querySelector(${JSON.stringify(item)})`);
  const first = await rect(item); await drag(item, 220, 100); const moved = await rect(item);
  assert.ok(Math.abs(moved.left - first.left - 220) < 2); assert.ok(Math.abs(moved.top - first.top - 100) < 2);
  assert.ok(actions.some(action => action.type === "updateBoardItem" && action.rect));
  await run("fixture.remote({x:.45,y:.12,width:.27,height:.3})"); await pause();
  assert.ok(await run(`Math.abs(document.querySelector(${JSON.stringify(item)}).getBoundingClientRect().left-document.querySelector('.classroom-v3-board-composition').getBoundingClientRect().left-document.querySelector('.classroom-v3-board-composition').clientWidth*.45)<2`), "an acknowledged local drag cannot mask a later edit from another manager");
  await dispatch("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1300, y: 900, buttons: 0 }); await pause();
  assert.equal(await run(`getComputedStyle(document.querySelector('.classroom-v3-board-item-tools')).opacity`), "1", "selected teacher controls stay available after pointer leaves");
  const start = await rect(item); await drag(grip, 90, 70); const fromGrip = await rect(item);
  assert.ok(Math.abs(fromGrip.left - start.left - 90) < 2); assert.ok(Math.abs(fromGrip.top - start.top - 70) < 2);
  const count = actions.filter(action => action.type === "bringBoardItemToFront").length;
  assert.equal(count, 0, "dragging the move button does not issue a separate bring-to-front click");
  await drag(resize, 70, 45); assert.ok((await rect(item)).width > fromGrip.width + 60);
  await click('button[aria-label="切换为圆形摄像头窗体"]');
  assert.ok(await run(`document.querySelector(${JSON.stringify(item)}).classList.contains('is-circle')`));
  const circle = await rect(item); await drag(resize, 30, 30); assert.ok((await rect(item)).width > circle.width + 20);
  await click('button[aria-label="锁定舞台"]'); const locked = await rect(item); await drag(item, 80, 80);
  assert.ok(Math.abs((await rect(item)).left - locked.left) < 2);
  await click('button[aria-label="解除舞台锁定"]'); await screenshot("teacher-manages-other-camera");
  await click('button[aria-label="移下讲台"]'); await wait("fixture.state().boardItems.length===0"); await pause();
  await run("fixture.reset()"); await wait(`!!document.querySelector(${JSON.stringify(item)})`);
  for (const [role, grant, recorder] of [["student", false, false], ["assistant", false, false], ["teacher", false, true]]) {
    await run(`fixture.setMode(${JSON.stringify(role)},${grant},${recorder});fixture.reset()`); await pause();
    const before = actions.length, previewCount = await run("previews.length"), position = await rect(item);
    assert.equal(await run(`document.querySelectorAll('.classroom-v3-board-item-tools button').length`), 0);
    assert.equal(await run(`document.querySelectorAll(${JSON.stringify(resize)}).length`), 0);
    await drag(item, 100, 80); assert.equal(actions.length, before); assert.equal(await run("previews.length"), previewCount);
    assert.ok(Math.abs((await rect(item)).left - position.left) < 2);
    if (role === "student") await screenshot("student-readonly");
  }
  await run(`fixture.setMode('assistant',true,false);fixture.reset()`); await pause(); await drag(item, 140, 80);
  assert.ok((await rect(item)).left > first.left + 120);
  win.setContentSize(390, 844); await wait("innerWidth===390"); await run("fixture.reset();fixture.large()"); await pause();
  assert.ok((await rect(item)).width > 250, "a later shared layout replaces the prior confirmed drag");
  await dispatch("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await click(item); const mobile = await rect(item); await drag(grip, 20, 40, true);
  assert.ok((await rect(item)).top > mobile.top + 30); await screenshot("assistant-mobile");
  assert.deepEqual(errors, []);
  console.log("PASS real board components: teacher moves another user's camera with mouse and grip, later remote changes replace saved optimistic state, removed cameras can be placed again, resize and circle resize, lock/unlock, read-only student/assistant/recorder, and authorized assistant touch drag. HTTP persistence is simulated.");
}
main().then(() => cleanup(0), error => { console.error(error); cleanup(1); });
function cleanup(code) { win?.destroy(); server?.close(); app.exit(code); }
