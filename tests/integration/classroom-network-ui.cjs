/* eslint-disable @typescript-eslint/no-require-imports -- Shipped React header and styles in Chromium, simulated media statistics. */
// Run: clients/desktop/node_modules/.bin/electron tests/integration/classroom-network-ui.cjs
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "../..");
let win, server;

async function main() {
  const cache = path.join(root, "node_modules/.cache/classroom-network-ui");
  const output = path.join(root, "outputs/classroom-network-2026-11-04");
  await fs.mkdir(cache, { recursive: true }); await fs.mkdir(output, { recursive: true });
  const source = `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{I18nProvider}from'@/lib/i18n/context';
    import{MinimalHeader}from'@/components/classroom/minimal-header';
    import{ClassroomNetworkStatus}from'@/components/classroom/network-status';
    const locale=new URLSearchParams(location.search).get('locale')||'zh-CN';
    document.cookie='NEXT_LOCALE='+locale+';path=/';localStorage.setItem('locale',locale);
    const initial={connectionState:'connected',participants:[],local:{microphoneOn:true,cameraOn:true},network:{uplinkQuality:1,downlinkQuality:1,latencyMs:100,packetLossPercent:0,receiveMode:'normal',publishMode:'normal'}};
    function Fixture(){const [media,setMedia]=useState(initial),[session,setSession]=useState('network-fixture');
      window.fixture={set:(mode,quality=mode==='normal'?1:mode==='low'?4:5)=>setMedia({...initial,network:{...initial.network,uplinkQuality:quality,downlinkQuality:quality,receiveMode:mode,publishMode:mode}}),offline:()=>setMedia({...initial,connectionState:'reconnecting'}),newSession:()=>setSession('network-fixture-next')};
      return <main className="classroom-v3-shell is-classin-layout" data-responsive-workspace="true">
        <MinimalHeader course={{id:'course',sessionId:session,name:'老挝合作 · 第 5 课',startTime:null,endTime:null}}
          runtime={{status:'live',startedAt:new Date(Date.now()-1200000).toISOString(),graceEndsAt:null}}
          now={Date.now()} roleName="教师" memberCount={12} recording canRecord canStart={false} canEnd canExtend={false} busy={false}
          onRecording={()=>{}} onFullscreen={()=>{}} onMembers={()=>{}} onBack={()=>{}} onStart={()=>{}} onEnd={()=>{}} onExtended={()=>{}} onRestarted={()=>{}}
          connectionState={media.connectionState} presenceHealthy status={null} settings={null} actions={[]}
          network={<ClassroomNetworkStatus key={session} media={media} sessionId={session}/>}/>
        <section style={{padding:32}}><p>课堂进行中</p><p>教师音频与双语字幕保持连接</p></section>
      </main>;
    }
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale={locale}><Fixture/></I18nProvider>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: root, loader: "tsx" }, bundle: true, write: false,
    platform: "browser", format: "iife", tsconfig: path.join(root, "tsconfig.json"), define: { "process.env": "{}" } });
  const cssPath = path.join(cache, "global.css");
  execFileSync("node", [require.resolve("tailwindcss/lib/cli.js"), "-i", path.join(root, "src/app/globals.css"), "-o", cssPath, "--minify"], {stdio:"pipe"});
  const css = await fs.readFile(cssPath, "utf8") + (await Promise.all(["classroom-classin.css", "classroom-light.css", "classroom-responsive.css"].map(name => fs.readFile(path.join(root, "src/app", name), "utf8")))).join("\n");
  server = http.createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); return res.end(bundle.outputFiles[0].text); }
    const query = new URL(req.url, "http://localhost").searchParams;
    const theme = query.get("theme") === "dark" ? "dark" : "light";
    const locale = query.get("locale") === "en" ? "en" : "zh-CN";
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><html lang="'+locale+'" class="'+theme+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/fixture.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { backgroundThrottling: false, partition: "network-ui-"+Date.now() } });
  const errors = [];
  win.webContents.on("console-message", event => { if (event.level === "error" || event.level >= 3) errors.push(event.message); });
  const run = code => win.webContents.executeJavaScript(code);
  const wait = async code => {
    for (let i=0;i<100;i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve,50)); }
    throw Error("Timeout: "+code+"; "+errors.join("; "));
  };
  const url = `http://127.0.0.1:${server.address().port}/`;
  const checks = [];
  for (const [width, height, theme, locale] of [[1440,900,"light","zh-CN"],[390,844,"light","zh-CN"],[320,740,"dark","zh-CN"],[390,844,"dark","en"]]) {
    win.setContentSize(width, height);
    await win.loadURL(`${url}?theme=${theme}&locale=${locale}`);
    await wait(`window.fixture && document.querySelector('.classroom-network-trigger')`);
    await run(`sessionStorage.clear();fixture.newSession();fixture.set('low')`);
    await wait(`document.querySelector('[data-testid=network-notice]')`);
    const geometry = await run(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height}};return{trigger:rect(document.querySelector('.classroom-network-trigger')),notice:rect(document.querySelector('.classroom-network-notice')),viewport:innerWidth}})()`);
    assert.ok(geometry.trigger.x >= 0 && geometry.trigger.right <= width, "signal stays in header at "+width);
    assert.ok(geometry.trigger.width >= 44 && geometry.trigger.height >= 44, "touch target at "+width);
    assert.ok(geometry.notice.x >= 0 && geometry.notice.right <= width, "notice stays in viewport at "+width);
    await run(`for(let i=0;i<15;i++)fixture.set('low')`);
    assert.equal(await run(`document.querySelectorAll('[data-testid=network-notice]').length`), 1);
    await run(`fixture.set('minimal')`);
    await wait(`document.querySelector('[data-video-mode=minimal]')`);
    assert.equal(await run(`document.querySelectorAll('[data-testid=network-notice]').length`), 1);
    await fs.writeFile(path.join(output, `network-${width}-${theme}-${locale}.png`), (await win.webContents.capturePage()).toPNG());
    await run(`document.querySelector('.classroom-network-notice button').click()`);
    await wait(`!document.querySelector('[data-testid=network-notice]')`);
    await run(`fixture.set('normal')`); await wait(`document.querySelector('[data-video-mode=normal]')`);
    await run(`fixture.set('minimal')`); await wait(`document.querySelector('[data-video-mode=minimal]')`);
    assert.equal(await run(`document.querySelectorAll('[data-testid=network-notice]').length`), 0, "no repeated notice after recovery");
    await run(`document.querySelector('.classroom-network-trigger').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
    await wait(`document.querySelector('.classroom-network-popover')`);
    assert.ok(await run(`document.querySelector('.classroom-network-popover').textContent.includes(${JSON.stringify(locale === "en" ? "Video reception is paused" : "已暂停接收视频")})`));
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));fixture.offline()`);
    await wait(`document.querySelector('.classroom-network-trigger').getAttribute('aria-label').includes(${JSON.stringify(locale === "en" ? "Offline" : "未连接")})`);
    checks.push({width,height,theme,locale,geometry,deduplicated:true,keyboardDetails:true});
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  await fs.writeFile(path.join(output,"ui-checks.json"),JSON.stringify({passed:true,checks,boundary:"Real classroom header and CSS in Chromium; simulated RTC statistics. No production network or physical-device acceptance."},null,2));
  console.log(JSON.stringify({passed:true,checks:checks.length,output}));
}
app.whenReady().then(main).then(()=>{win?.destroy();server?.close();app.quit();}).catch(error=>{console.error(error);win?.destroy();server?.close();app.exit(1);});
