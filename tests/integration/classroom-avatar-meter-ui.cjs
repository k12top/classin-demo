/* eslint-disable @typescript-eslint/no-require-imports -- Real React seats and shipped CSS in Chromium, simulated RTC. */
// Run: clients/desktop/node_modules/.bin/electron tests/integration/classroom-avatar-meter-ui.cjs
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
let win, server;
async function main() {
  const cache = path.join(root, 'node_modules/.cache/classroom-avatar-meter');
  const output = path.join(root, 'outputs/classroom-avatar-meter-2026-10-27');
  await fs.mkdir(cache, { recursive: true }); await fs.mkdir(output, { recursive: true });
  const source = `
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{I18nProvider}from'@/lib/i18n/context';import{TestSeat}from'@/components/classroom/classroom-v3';
    localStorage.setItem('locale','zh-CN');window.fixtureLevel=.7;window.fixtureCounts={attach:0,detach:0};
    const provider={getMicrophoneLevel:()=>window.fixtureLevel,attachVideo:(id,target)=>{
      window.fixtureCounts.attach++;const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#354753';ctx.fillRect(0,0,320,180);
      const photo=new Image();photo.onload=()=>{ctx.drawImage(photo,70,0,180,180);window.fixturePhotoReady=true};photo.src='/presenter.jpg';
      target.fixturePaintTimer=setInterval(()=>{if(photo.complete&&photo.naturalWidth)ctx.drawImage(photo,70,0,180,180)},50);
      const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;
      video.srcObject=canvas.captureStream(5);target.replaceChildren(video);video.play();
    },detachVideo:(id,target)=>{window.fixtureCounts.detach++;clearInterval(target.fixturePaintTimer);target.querySelector('video')?.srcObject?.getTracks().forEach(t=>t.stop());target.replaceChildren()}};
    const members=[{userId:'self',displayName:'nkwill22',role:'student',avatar:'/presenter.jpg',rtcUids:[1]},
      {userId:'teacher',displayName:'nkwill',role:'teacher',avatar:'',rtcUids:[2],screenUids:[1000000002]},
      {userId:'simon',displayName:'Simon',role:'student',avatar:'/presenter.jpg',rtcUids:[3]}]
      .map(m=>({...m,online:true,connectionStatus:'online',onStage:true,microphoneAllowed:true,cameraAllowed:true,rewardCount:0}));
    function Fixture(){const [revision,refresh]=useState(0),[video,setVideo]=useState(true),[order,setOrder]=useState(members.map(m=>m.userId));
      window.fixture={refresh:()=>refresh(v=>v+1),setVideo,setOrder,raise:()=>{members[2].handRaisedAt=new Date().toISOString();refresh(v=>v+1)},longName:()=>{members[2].displayName='Simon · 很长的学生姓名 · English name';refresh(v=>v+1)}};
      const participants=members.map((m,i)=>({id:String(i+1),displayName:m.displayName,kind:'camera',hasAudio:i>0,hasVideo:i===2&&video,isLocal:i===0}));
      participants.push({id:'1000000002',kind:'screen',hasVideo:true,hasAudio:false,isLocal:false});
      const media={participants,local:{microphoneOn:false,cameraOn:false}};
      return <main className="classroom-v3-shell is-classin-layout" data-responsive-workspace="true" data-fixture-revision={revision}>
        <header className="fixture-header"><span>Python-S 26班 · 第 3 课</span><span>1:14:45</span></header>
        <div className="classroom-v3-live-rail"><div className="classroom-v3-seats">{order.map(id=>{const member=members.find(m=>m.userId===id);return <TestSeat key={id} member={member} participant={participants.find(p=>p.id===String(members.indexOf(member)+1))}
          provider={provider} media={media} currentUserId="self" canManage={false} canReward={false} busy={false} canReorder={false} previewPlacesOnBoard={false}/>})}</div></div>
        <section className="fixture-lesson"><div className="fixture-editor"><header>Python作品.py</header><pre>{'c = [3, 6, 11, 18, 9, 12, 5, 2, 22, 10]\\n\\nn = len(c)\\nfor i in range(n - 1):\\n    for j in range(n - 1 - i):\\n        if c[j] > c[j + 1]:\\n            c[j], c[j + 1] = c[j + 1], c[j]\\n\\nprint(c)'}</pre></div></section>
        <footer className="fixture-toolbar">课堂共享画面</footer>
      </main>;
    }createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', tsconfig: path.join(root, 'tsconfig.json'), define: { 'process.env': '{}' }, plugins: [{ name: 'private-seat-export', setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default {};', loader: 'js' }));
    build.onLoad({ filter: /classroom-v3\.tsx$/ }, async args => ({ contents: await fs.readFile(args.path, 'utf8') + '\nexport {LiveRailSeat as TestSeat};', loader: 'tsx', resolveDir: path.dirname(args.path) }));
  } }] });
  const cssPath = path.join(cache, 'global.css');
  execFileSync('node', [require.resolve('tailwindcss/lib/cli.js'), '-i', path.join(root, 'src/app/globals.css'), '-o', cssPath, '--minify'], { stdio: 'pipe' });
  const css = await fs.readFile(cssPath, 'utf8') + '\n' + (await Promise.all(['classroom-classin.css', 'classroom-light.css', 'classroom-responsive.css'].map(name => fs.readFile(path.join(root, 'src/app', name), 'utf8')))).join('\n');
  // The committed image keeps this test self-contained; a portrait can be
  // supplied when capturing a design review without changing production data.
  const photoPath = process.env.CLASSROOM_AVATAR_FIXTURE_PHOTO || path.join(root, 'public/classroom/entry-book-v2.webp');
  const photo = await fs.readFile(photoPath);
  server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
    if (req.url === '/fixture.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
    if (req.url === '/presenter.jpg') { res.setHeader('content-type', photoPath.endsWith('.webp') ? 'image/webp' : 'image/jpeg'); return res.end(photo); }
    res.end(`<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>
      body{margin:0;font-family:system-ui;background:#f5f5f7}.classroom-v3-shell[data-responsive-workspace]{display:flex!important;flex-direction:column!important;height:100vh!important;min-height:0!important}
      .fixture-header{height:64px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#fff;font-size:14px;font-weight:600;color:#1d1d1f}.fixture-header>span:last-child{color:#4f46e5;font-variant-numeric:tabular-nums}
      .classroom-v3-shell[data-responsive-workspace]>.classroom-v3-live-rail{padding:0;flex:none}
      .fixture-lesson{flex:1;min-height:0;margin:0 12px;background:#0d0f12;display:grid;align-items:center;border-radius:14px;overflow:hidden}.fixture-editor{background:#fff;color:#25313b;overflow:hidden}.fixture-editor header{background:#dc6368;color:#fff;padding:12px;text-align:center;font-size:12px}.fixture-editor pre{padding:24px 16px;font-size:clamp(9px,1.25vw,17px);line-height:1.8;white-space:pre}.fixture-toolbar{padding:22px;text-align:center;color:#686b74;font-size:12px}
    </style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ width: 390, height: 844, show: false, webPreferences: { backgroundThrottling: false } });
  const errors = []; win.webContents.on('console-message', event => { if (event.level === 'error' || event.level >= 3) errors.push(event.message); });
  const run = code => win.webContents.executeJavaScript(code);
  const settle = () => new Promise(resolve => setTimeout(resolve, 400));
  const wait = async code => { for (let i = 0; i < 100; i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw Error('Timeout: ' + code + '; ' + errors.join('; ')); };
  const checks = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 740], [740, 390]]) {
    win.setContentSize(width, height); await win.loadURL(`http://127.0.0.1:${server.address().port}/?lang=zh-CN`);
    await wait(`document.querySelector('[role=meter][data-speaking=true]') && document.querySelector('video')?.readyState>=2 && document.querySelector('.classroom-v3-media-avatar img') && window.fixturePhotoReady`); await settle();
    await wait(`(()=>{const v=document.querySelector('video'),c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,320,180);const p=ctx.getImageData(160,90,1,1).data;return Math.abs(p[0]-53)+Math.abs(p[1]-71)+Math.abs(p[2]-83)>30})()`);
    const geometry = await run(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}};return [...document.querySelectorAll('.classroom-v3-seat')].map(s=>({name:rect(s.querySelector('.classroom-v3-seat-name')),meter:s.querySelector('[role=meter]')?rect(s.querySelector('[role=meter]')):null,seat:rect(s)}))})()`);
    for (const g of geometry) { assert.ok(g.name.right < g.meter.x, 'name stays clear of right-hand meter at ' + width); assert.ok(g.meter.right <= g.seat.right - 5); }
    const before = await run('JSON.stringify(fixtureCounts)');
    const positions = await run(`new Promise(resolve=>{const samples=[];let i=0;const tick=()=>{fixture.refresh();requestAnimationFrame(()=>{samples.push([...document.querySelectorAll('.classroom-v3-seat')].map(e=>e.getBoundingClientRect().x));if(++i<30)setTimeout(tick,16);else resolve(samples)})};tick()})`);
    for (let i = 0; i < 3; i++) assert.ok(Math.max(...positions.map(p => p[i])) - Math.min(...positions.map(p => p[i])) < .5, 'stationary seat on repeated presence snapshots');
    assert.equal(await run('JSON.stringify(fixtureCounts)'), before, 'snapshots never remount video');
    await fs.writeFile(path.join(output, `design-${width}.png`), (await win.webContents.capturePage()).toPNG());
    await run('fixture.longName()'); await settle();
    assert.ok(await run(`(()=>{const s=document.querySelectorAll('.classroom-v3-seat')[2];return s.querySelector('.classroom-v3-seat-name').getBoundingClientRect().right<s.querySelector('[role=meter]').getBoundingClientRect().left})()`), 'long name reserves meter gutter');
    await run('fixture.setVideo(false)'); await wait(`document.querySelectorAll('.classroom-v3-media-avatar img').length===2`);
    await run('fixture.setVideo(true)'); await wait(`document.querySelector('video')?.readyState>=2`);
    await run('fixture.raise()'); await wait(`document.querySelector('.classroom-v3-video-hand-raised')`);
    assert.equal(await run(`document.querySelectorAll('.classroom-v3-video-hand-raised').length`), 1, 'a raised hand is shown once');
    await run('window.fixtureLevel=0'); await wait(`[...document.querySelectorAll('[role=meter]')].every(e=>getComputedStyle(e).visibility==='hidden')`);
    checks.push({ width, height, geometry, stableSnapshots: 30 });
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  await fs.writeFile(path.join(output, 'ui-checks.json'), JSON.stringify({ passed: true, boundary: 'Real LiveRailSeat, MediaSurface, MicrophoneLevel and shipped CSS in Chromium; simulated RTC and lesson surround. No live accounts or physical-phone acceptance.', checks }, null, 2));
  console.log('PASS: right meter, long names, profile photos, stable seats/video, mute and camera restore; 4 viewports.');
}
app.whenReady().then(main).then(() => { win?.destroy(); server?.close(); app.quit(); }).catch(error => { console.error(error); win?.destroy(); server?.close(); app.exit(1); });
