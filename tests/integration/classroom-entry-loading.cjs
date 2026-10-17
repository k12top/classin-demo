/* eslint-disable @typescript-eslint/no-require-imports -- Actual loading UI in Chromium; entry phases and failures are simulated. */
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
let win, server;
async function main() {
  const cache = path.join(root, "node_modules/.cache/classroom-entry-loading");
  const output = process.env.CLASSROOM_ENTRY_OUTPUT || path.join(root, "outputs/classroom-entry-loading-2026-10-17");
  await fs.mkdir(cache, { recursive: true }); await fs.mkdir(output, { recursive: true });
  const bundle = await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{ClassroomLoading}from'@/components/classroom/classroom-loading';import{I18nProvider,useTranslation}from'@/lib/i18n/context';
    function Fixture(){const[phase,setPhase]=useState('identity'),[attempt,setAttempt]=useState(0),[error,setError]=useState(''),[course,setCourse]=useState('数学 L7 · 第 2 课');const{setLocale}=useTranslation();
      window.fixture={setPhase,setError,setCourse,setLocale,retries:window.fixture?.retries||0,backs:window.fixture?.backs||0};
      return <ClassroomLoading key={attempt} phase={phase} courseName={course} errorMessage={error} onRetry={()=>{window.fixture.retries++;setError('');setPhase('session');setAttempt(n=>n+1)}} onBack={()=>window.fixture.backs++}/>}
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);
  ` }, bundle: true, write: false, outfile: path.join(cache, "fixture.js"), format: "iife", platform: "browser", define: { "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json") });
  const cssPath = path.join(cache, "global.css");
  execFileSync("node", [require.resolve("tailwindcss/lib/cli.js"), "-i", "src/app/globals.css", "-o", cssPath, "--minify"], { cwd: root, stdio: "pipe" });
  const css = await fs.readFile(cssPath, "utf8") + "\n" + bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
  server = http.createServer(async (request, response) => {
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); return response.end(bundle.outputFiles.find(file => file.path.endsWith(".js")).text); }
    if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); return response.end(css); }
    if (request.url === "/classroom/entry-book-v2.webp") { response.setHeader("Content-Type", "image/webp"); return response.end(await fs.readFile(path.join(root, "public/classroom/entry-book-v2.webp"))); }
    if (request.url === "/site-logo.svg") { response.setHeader("Content-Type", "image/svg+xml"); return response.end(await fs.readFile(path.join(root, "public/site-logo.svg"))); }
    response.end('<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui}button,a{font-family:inherit}</style><div id="root"></div><script src="/fixture.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); await app.whenReady();
  win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { backgroundThrottling: false, partition: "entry-loading-" + Date.now() } });
  const errors = []; win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  const run = code => win.webContents.executeJavaScript(code);
  const wait = async code => { const until = Date.now() + 17000; while (!await run(`Boolean(${code})`)) { if (Date.now() > until) throw new Error("timeout " + code + "; " + errors.join(";")); await new Promise(resolve => setTimeout(resolve, 50)); } };
  const settle = async () => { await run("Promise.all([...document.images].map(e=>e.decode().catch(()=>{})))"); await run("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))"); await new Promise(resolve => setTimeout(resolve, 120)); };
  const capture = async name => { await settle(); await fs.writeFile(path.join(output, name + ".png"), (await win.webContents.capturePage()).toPNG()); };
  const fits = async () => {
    await settle();
    const bounds = await run(`(()=>{const e=document.querySelector('main'),r=e.getBoundingClientRect();return{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,top:r.top,bottom:r.bottom,buttons:[...document.querySelectorAll('button')].map(e=>({height:e.getBoundingClientRect().height,right:e.getBoundingClientRect().right}))}})()`);
    assert.ok(bounds.scrollWidth <= bounds.width && bounds.scrollHeight <= bounds.height, JSON.stringify(bounds));
    assert.ok(bounds.buttons.every(button => button.height >= 44 && button.right <= bounds.width), JSON.stringify(bounds));
  };
  await win.loadURL(`http://127.0.0.1:${server.address().port}/?lang=zh-CN`);
  await wait("document.querySelector('[data-entry-phase=identity]') && document.querySelector('img[src*=entry-book]').naturalWidth>0");
  assert.equal(await run("document.querySelector('[data-entry-scene]').getBoundingClientRect().width"), 400);
  assert.equal(await run("getComputedStyle(document.querySelector('[data-entry-scene] path:nth-child(3)')).animationPlayState"), "running");
  await run("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))");
  await wait("getComputedStyle(document.querySelector('[data-entry-scene] path:nth-child(3)')).animationPlayState==='paused'");
  await run("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");
  await wait("getComputedStyle(document.querySelector('[data-entry-scene] path:nth-child(3)')).animationPlayState==='running'");
  assert.equal(await run("document.querySelectorAll('li[data-state=complete]').length"), 0);
  await run("fixture.setPhase('session')"); await wait("document.querySelector('[data-entry-phase=session]')");
  assert.equal(await run("document.querySelectorAll('li[data-state=complete]').length"), 1);
  assert.equal(await run("document.querySelector('[aria-current=step]').textContent"), "读取课堂");
  await fits(); await capture("desktop");
  await run("fixture.setPhase('media')"); await wait("document.querySelector('[data-entry-phase=media]')");
  assert.equal(await run("document.querySelectorAll('li[data-state=complete]').length"), 2);
  win.setContentSize(390, 844); await wait("innerWidth===390"); await fits(); await capture("mobile");
  assert.equal(await run("document.querySelector('[data-entry-scene]').getBoundingClientRect().width"), 330);
  win.setContentSize(320, 568); await wait("innerWidth===320"); await fits(); await capture("phone-compact");
  win.setContentSize(390, 844); await wait("innerWidth===390"); await fits();
  await wait("document.querySelector('[data-entry-slow=true]')");
  assert.ok(await run("document.body.textContent.includes('连接比平时慢')")); await fits(); await capture("mobile-slow");
  await run("[...document.querySelectorAll('button')].find(e=>e.textContent==='重新连接').click()");
  await wait("document.querySelector('[data-entry-slow=false][data-entry-phase=session]')");
  assert.equal(await run("fixture.retries"), 1);
  await run("fixture.setError('课堂暂时无法连接，请稍后重试。')"); await wait("document.querySelector('[role=alert]')");
  assert.equal(await run("document.querySelectorAll('ol').length"), 0);
  assert.equal(await run("getComputedStyle(document.querySelector('[data-entry-scene] > div')).animationName"), "none");
  assert.equal(await run("getComputedStyle(document.querySelector('[data-entry-scene] > svg')).visibility"), "hidden");
  await fits(); await capture("mobile-error");
  await run("[...document.querySelectorAll('button')].find(e=>e.textContent==='返回课程').click()");
  assert.equal(await run("fixture.backs"), 1);
  await run("fixture.setError('');fixture.setLocale('en');document.documentElement.className='dark'");
  win.setContentSize(1440, 900); await wait("document.body.textContent.includes('Load classroom')"); await fits(); await capture("desktop-dark");
  const darkIndicatorContrast = await run(`(()=>{
    const fg=getComputedStyle(document.querySelector('[aria-current=step] svg')).color.match(/[\\d.]+/g).slice(0,3).map(Number);
    const bg=getComputedStyle(document.querySelector('main')).backgroundColor.match(/[\\d.]+/g).slice(0,3).map(Number);
    const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
    const values=[luminance(fg),luminance(bg)].sort((a,b)=>b-a);return(values[0]+0.05)/(values[1]+0.05);
  })()`);
  assert.ok(darkIndicatorContrast >= 3, "Dark current-step icon contrast " + darkIndicatorContrast);
  await win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const animation = await run("getComputedStyle(document.querySelector('[aria-current=step] svg')).animationName");
  assert.equal(animation, "none");
  assert.equal(await run("getComputedStyle(document.querySelector('[data-entry-scene] path:nth-child(3)')).animationName"), "none");
  await run("fixture.setLocale('zh-TW');fixture.setCourse('數學 L7：分數與比例、幾何與代數的課堂練習')");
  win.setContentSize(844, 390); await wait("document.body.textContent.includes('讀取課堂')"); await fits(); await capture("landscape-reduced-motion");
  if (process.env.CLASSROOM_ENTRY_RECORD === "1") {
    await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", { features: [] });
    await run("fixture.setLocale('zh-CN');fixture.setCourse('数学 L7 · 第 2 课');fixture.setPhase('session');document.documentElement.className='light'");
    win.setContentSize(960, 640); await wait("innerWidth===960 && document.body.textContent.includes('读取课堂')"); await fits();
    const frames = path.join(output, "frames"); await fs.mkdir(frames, { recursive: true });
    await run("window.previewAnimations=document.getAnimations();previewAnimations.forEach(a=>{a.pause();a.currentTime=0})");
    for (let i = 0; i < 72; i++) {
      await run(`previewAnimations.forEach(a=>a.currentTime=${i * 50});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await fs.writeFile(path.join(frames, "frame-" + String(i).padStart(3, "0") + ".png"), (await win.webContents.capturePage()).toPNG());
    }
    await run("previewAnimations.forEach(a=>a.play())");
  }
  assert.deepEqual(errors, []);
  console.log("PASS actual loading UI: real prop-driven stages, 12-second recovery, retry reset, back callback, errors, three locales, light/dark desktop/mobile/landscape, reduced motion, hidden-page animation pause, book image loading and 44px actions. Session/RTC responses are simulated here; database enrollment/access is tested separately.");
}
main().then(() => cleanup(0), error => { console.error(error); cleanup(1); });
function cleanup(code) { win?.destroy(); server?.close(); app.exit(code); }
