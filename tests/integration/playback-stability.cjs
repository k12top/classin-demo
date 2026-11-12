// Isolated Electron acceptance for the actual playback page.
// clients/desktop/node_modules/.bin/electron tests/integration/playback-stability.cjs
// No Next server, database, provider controls, or production requests are used.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
let win, server;
const trackingOnly=process.argv.includes('--tracking-only'),accessResumeOnly=process.argv.includes('--access-resume-only'),speedOnly=process.argv.includes('--speed-only'),missingLessonOnly=process.argv.includes('--missing-lesson-only'),trackingRequests=[],trackingHeld=new Set();let trackingMode='hold-start',watchId=0,currentWatch=null,trackingAborts=0;

async function main() {
  const output = path.join(root, 'outputs/playback-stability');
  const cache = path.join(root, 'node_modules/.cache/playback-stability');
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(cache, { recursive: true });
  const mediaFile = process.env.CLASSROOM_PLAYBACK_TEST_MEDIA || path.join(cache, 'fixture.mp4');
  if (!process.env.CLASSROOM_PLAYBACK_TEST_MEDIA) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=12', '-t', '50', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mediaFile]);
  const media = await fs.readFile(mediaFile);
  const stubs = {
    'next/navigation': `const router={push:p=>window.fixtureNavigation=p};export const useRouter=()=>router;`,
    '@/lib/auth-context': `export const useAuth=()=>({user:window.fixtureUser,loading:false,logout:async()=>{}});`,
    '@/components/portal/portal-shell': `import React from'react';export function PortalShell({children}){return <div><header className="border-b p-4 font-semibold">课程回放 · 本地隔离验证</header><div className="p-6">{children}</div></div>}`,
    '@/lib/auth-login': `export const redirectToSsoLogin=()=>{window.fixtureRedirected=true};`,
    '@/lib/auth-refresh-client': `export const tryOAuthRefresh=async()=>false;`,
  };
  const source = `
    import React,{Suspense} from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import Page from'@/app/courses/[id]/playback/page';
    const query=new URLSearchParams(location.search),tracking=query.has('tracking')||query.has('speed'),accessResume=query.has('access-resume')||query.has('speed');window.fixtureUser={userId:tracking?'student':'teacher',name:tracking?'student':'teacher',displayName:tracking?'测试学生':'测试老师',role:tracking?'student':'teacher',avatar:''};
    const nativeFetch=window.fetch.bind(window), stats=window.fixtureStats={recordings:0,resolutions:0,requests:[],loadStarts:0,removed:0};
    window.fixture={fail:new URLSearchParams(location.search).has("initial-failure"),omitLesson:query.has('missing-lesson'),delay:query.has('missing-lesson'),release:null};
    const lessons=['lesson','other'].map((id,i)=>({id,title:'回放稳定性验证 · 第'+(i+1)+'课',status:'finished',viewerRole:tracking?'student':undefined,startTime:'2026-10-23T08:00:00Z',endTime:'2026-10-23T10:00:00Z',_count:{recordings:i?0:1}}));
    window.fetch=async(input,init)=>{const url=new URL(String(input),location.href);stats.requests.push(url.pathname);let payload={};let status=200;
      if(url.pathname==='/api/courses/fixture')payload={course:{id:'fixture',name:'回放稳定性验证',teacherName:'测试老师',status:'finished',canTeach:!tracking}};
      else if(url.pathname==='/api/courses/fixture/sessions'){if(window.fixture.omitLesson)await new Promise(resolve=>setTimeout(resolve,100));payload={sessions:window.fixture.omitLesson?[]:lessons};}
      else if(url.pathname==='/api/sessions/lesson/recordings'){stats.recordings++;if(window.fixture.delay)await new Promise(resolve=>window.fixture.release=resolve);if(window.fixture.denied){status=403;payload={error:'forbidden'}}else if(window.fixture.malformed){payload={recordings:[null]}}else if(window.fixture.fail){status=503;payload={error:'暂时无法更新录像状态'}}else payload={refreshAfterMs:!accessResume&&stats.recordings<8?5000:null,recordings:[{id:'attempt:0',segment:1,status:accessResume||stats.recordings>=3?'completed':'processing',startedAt:'2026-10-23T08:00:00Z',stoppedAt:null,playbackFormat:'mp4',playbackUrl:'/api/sessions/lesson/recordings/attempt/play?asset=clip.mp4'}]};}
      else if(url.pathname==='/api/sessions/other/recordings')payload={recordings:[],refreshAfterMs:null};
      else if(url.pathname.includes('/summary'))payload={summary:null,captions:[],canManage:false};
      else if(url.pathname==='/api/sessions/lesson/recordings/attempt/play'){stats.resolutions++;payload={url:location.origin+'/media.mp4',format:'mp4'};}
      else return nativeFetch(input,init);
      if(query.has('speed')&&Array.isArray(payload.recordings)&&payload.recordings.length)payload.recordings.push({...payload.recordings[0],id:'attempt:1',segment:2,playbackUrl:'/api/sessions/lesson/recordings/attempt/play?asset=clip2.mp4'});
      return Response.json(payload,{status});
    };
    const params=Promise.resolve({id:'fixture'}),searchParams=Promise.resolve(query.has('missing-lesson')?{sessionId:'lesson'}:{});
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale={query.get('lang')||'zh-CN'}><Suspense fallback={<p>准备回放…</p>}><Page params={params} searchParams={searchParams}/></Suspense></I18nProvider>);
  `;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, outfile: path.join(cache, 'fixture.js'), platform: 'browser', format: 'iife', define: { 'process.env': '{}' }, tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'isolated-playback', setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: root }));
  } }] });
  const cssFile = path.join(cache, 'fixture.css');
  execFileSync('node', [require.resolve('tailwindcss/lib/cli.js'), '-i', path.join(root, 'src/app/globals.css'), '-o', cssFile, '--minify'], { stdio: 'pipe' });
  const css = Buffer.concat([await fs.readFile(cssFile),Buffer.from('\n'),bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.contents||Buffer.alloc(0)]);
  server = http.createServer((req, res) => {
    if(req.url==='/api/courses/fixture/playback-progress'){
      let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
        const value=JSON.parse(body),method=req.method;trackingRequests.push({method,body:value});res.setHeader('content-type','application/json');
        let receipt;
        if(method==='POST'){currentWatch={sessionId:'watch-'+(++watchId),challenge:crypto.randomUUID()};receipt={tracked:true,...currentWatch,totalDurationSec:0};}
        else if(!currentWatch||value.sessionId!==currentWatch.sessionId||value.challenge!==currentWatch.challenge){res.statusCode=409;return res.end('{"error":"expired"}');}
        else {const challenge=value.state==='playing'?crypto.randomUUID():null;receipt={tracked:true,challenge,totalDurationSec:5};currentWatch=challenge?{...currentWatch,challenge}:null;}
        if(trackingMode==='hold-start'&&method==='POST'||trackingMode==='hold-heartbeat'&&method==='PATCH'){
          trackingHeld.add(res);res.on('close',()=>{trackingHeld.delete(res);trackingAborts++;});
          // Commit first, then stall the body. A lost rotated nonce must never
          // be replayed and the eight-second budget must include body reads.
          if(method==='PATCH'){res.writeHead(200);res.write('{"tracked":');}return;
        }
        res.end(JSON.stringify(receipt));
      });return;
    }
    if (req.url === '/fixture.js') { res.setHeader('content-type', 'text/javascript'); return res.end(bundle.outputFiles.find(f => f.path.endsWith('.js')).text); }
    if (req.url === '/fixture.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
    if (req.url === '/media.mp4') {
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
      res.writeHead(range ? 206 : 200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': end - start + 1, ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) });
      return res.end(media.subarray(start, end + 1));
    }
    if (req.url.startsWith('/api/')) { res.statusCode = 500; return res.end('Unexpected boundary request'); }
    res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  win = new BrowserWindow({ width: 1366, height: 1000, show: false, webPreferences: { backgroundThrottling: false, partition: 'playback-stability-' + Date.now() } });
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error' || event.level >= 3) errors.push(event.message); });
  const run = async code => {
    try { return await win.webContents.executeJavaScript(code); }
    catch (error) { throw new Error(`Browser script failed: ${code}\n${errors.join('\n')}\n${error.message}`); }
  };
  const wait = async (code, ms = 15000) => {
    const until = Date.now() + ms;
    do { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < until);
    throw new Error('Timed out: ' + code + '\n' + errors.join('\n') + '\n' + await run('document.body.innerText.slice(0,1600)'));
  };
  if(speedOnly)trackingMode='ready';
  await win.loadURL(`http://127.0.0.1:${server.address().port}/courses/fixture/playback?sessionId=lesson&lang=zh-CN${trackingOnly?'&tracking=1':''}${accessResumeOnly?'&access-resume=1':''}${speedOnly?'&speed=1':''}${missingLessonOnly?'&missing-lesson=1':''}`);
  if(missingLessonOnly){
    await wait(`document.body.innerText.includes('当前账号没有这段录像的访问权限')`,4000);
    assert.equal(await run(`document.querySelectorAll('video').length`),0);
    assert.equal(await run(`document.querySelector('main').innerText.includes('正在加载回放')`),false,'an omitted requested lesson must leave loading after the in-flight recording read is cancelled');
    await fs.writeFile(path.join(output,'missing-lesson-denied.png'),(await win.webContents.capturePage()).toPNG());
    await run(`fixture.omitLesson=false;fixture.delay=false;fixture.release?.();Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('重新加载回放')).click()`);
    await wait(`document.querySelector('video')?.readyState>=2`);
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'missing-lesson-result.json'),JSON.stringify({passed:true,checks:['requested lesson omitted from authorized list','cancelled metadata read leaves loading','denial shown without video','retry button reloads restored lesson and video'],boundary:'Actual page with isolated HTTP authorization and synthetic media; real account verification is recorded separately.'},null,2));
    console.log('PASS omitted replay lesson: cancelled metadata clears loading, denial shown, restored list plays');return;
  }
  await wait(`document.querySelector('video')?.readyState>=2`);
  await run(`window.initialVideo=document.querySelector('video');window.initialVideo.muted=true;window.initialVideo.addEventListener('loadstart',()=>window.fixtureStats.loadStarts++);new MutationObserver(()=>{if(document.querySelector('video')!==window.initialVideo)window.fixtureStats.removed++}).observe(document.getElementById('root'),{childList:true,subtree:true});window.initialVideo.play()`);
  await wait(`window.initialVideo.currentTime>0.3`);
  if(speedOnly){
    for(let i=0;i<100&&!trackingRequests.some(r=>r.method==='POST');i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(await run(`document.querySelector('[data-playback-speed]').value`),'1');
    assert.deepEqual(await run(`Array.from(document.querySelector('[data-playback-speed]').options).map(o=>Number(o.value))`),[0.75,1,1.25,1.5,2]);
    const posts=()=>trackingRequests.filter(r=>r.method==='POST'),initialPosts=posts().length;
    await run(`const s=document.querySelector('[data-playback-speed]');s.value='1.5';s.dispatchEvent(new Event('change',{bubbles:true}))`);
    await wait(`document.querySelector('video').playbackRate===1.5`);
    for(let i=0;i<100&&posts().length<initialPosts+1;i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(posts().length,initialPosts+1,'speed change restarts tracking once despite native default/rate events');assert.equal(posts().at(-1).body.playbackRate,1.5);
    await run(`initialVideo.dispatchEvent(new Event('ratechange'));initialVideo.dispatchEvent(new Event('ratechange'))`);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(posts().length,initialPosts+1,'duplicate unchanged events cannot inflate watch sessions');
    const before=await run(`({time:initialVideo.currentTime,now:performance.now()})`);await new Promise(resolve=>setTimeout(resolve,1200));const after=await run(`({time:initialVideo.currentTime,now:performance.now()})`);assert.ok((after.time-before.time)/((after.now-before.now)/1000)>1.25,'decoded media advances at the selected rate');
    await run(`initialVideo.playbackRate=1.25`);await wait(`document.querySelector('[data-playback-speed]').value==='1.25'`);
    for(let i=0;i<100&&posts().length<initialPosts+2;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(posts().at(-1).body.playbackRate,1.25);
    await run(`initialVideo.load()`);await wait(`initialVideo.readyState>=2&&initialVideo.playbackRate===1.25`);
    await run(`window.beforeClip=document.querySelector('video');Array.from(document.querySelectorAll('button')).find(b=>/片段\\s*2/.test(b.textContent)).click()`);
    await wait(`document.querySelector('video')!==window.beforeClip&&document.querySelector('video')?.readyState>=2`);
    assert.equal(await run(`document.querySelector('video').playbackRate`),1.25,'manual clip replacement retains speed');
    await run(`Array.from(document.querySelectorAll('button')).find(b=>/片段\\s*1/.test(b.textContent)).click()`);await wait(`document.querySelector('video')?.readyState>=2`);
    await run(`window.endingClip=document.querySelector('video');endingClip.muted=true;endingClip.currentTime=endingClip.duration-0.25;endingClip.play()`);
    await wait(`document.querySelector('video')!==endingClip&&document.querySelector('video')?.currentTime>0.2&&!document.querySelector('video').paused`);
    assert.equal(await run(`document.querySelector('video').playbackRate`),1.25,'real ended event advances to the next clip at the chosen speed');
    await run(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('第2课')).click()`);await wait(`!document.querySelector('video')`);
    await run(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('第1课')).click()`);await wait(`document.querySelector('video')?.readyState>=2`);
    assert.equal(await run(`document.querySelector('video').playbackRate`),1.25);assert.equal(await run(`document.querySelector('[data-playback-speed]').value`),'1.25');
    const layouts=[];
    for(const [locale,width,label]of [['zh-CN',1366,'回放倍速'],['zh-TW',1024,'回放倍速'],['en',390,'Playback speed'],['vi',320,'Tốc độ phát lại']]){
      win.setContentSize(width,900);await win.loadURL(`http://127.0.0.1:${server.address().port}/courses/fixture/playback?sessionId=lesson&lang=${locale}&speed=1`);
      await wait(`document.querySelector('video')?.readyState>=2&&document.querySelector('[data-playback-speed]')?.getAttribute('aria-label')===${JSON.stringify(label)}`);
      const geometry=await run(`(()=>{const s=document.querySelector('[data-playback-speed]'),r=s.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,height:r.height,viewport:innerWidth,page:document.documentElement.scrollWidth}})()`);
      assert.ok(geometry.left>=0&&geometry.right<=geometry.viewport+1&&geometry.height>=32&&geometry.page<=geometry.viewport+1,JSON.stringify({locale,width,geometry}));
      await run(`document.querySelector('[data-playback-speed]').scrollIntoView({block:'center'})`);await fs.writeFile(path.join(output,`speed-${locale}-${width}.png`),(await win.webContents.capturePage()).toPNG());layouts.push({locale,width,geometry});
    }
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'speed-result.json'),JSON.stringify({passed:true,realH264Mp4Decoded:true,layouts,checks:['design rate options','real media speed','native menu synchronization','source reload retains speed','manual clip replacement retains speed','real ended event advances next clip at chosen speed','lesson replacement retains speed','one tracking restart per change','unchanged native events ignored'],boundary:'Actual playback page, media element and speed control in Electron; HTTP metadata, identity and tracking receipts are fixtures. No real student credit acceptance.'},null,2));
    console.log('PASS replay speed: native decoding, tracking transition once, native menu sync, source/lesson persistence and four locale/width layouts');return;
  }
  if(accessResumeOnly){
    const initial=await run(`fixtureStats.recordings`);
    await run(`window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('pageshow'))`);
    await wait(`fixtureStats.recordings>${initial}`);await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(await run(`fixtureStats.recordings`),initial+1,'resume burst coalesces one authorized read');
    assert.equal(await run(`document.querySelector('video')===window.initialVideo&&!window.initialVideo.paused`),true,'authorized resume retains media');
    assert.equal(await run(`fixtureStats.resolutions`),1,'healthy resume does not re-resolve the source');
    await run(`fixture.fail=true;window.dispatchEvent(new Event('focus'))`);
    await wait(`document.body.innerText.includes('当前视频可继续播放')`);
    assert.equal(await run(`document.querySelector('video')===window.initialVideo&&!window.initialVideo.paused`),true,'503 retains playing media');
    await run(`fixture.fail=false;window.dispatchEvent(new Event('online'))`);await wait(`!document.body.innerText.includes('当前视频可继续播放')`);
    await run(`fixture.denied=true;window.dispatchEvent(new Event('focus'))`);await wait(`!document.querySelector('video')`);
    assert.ok(await run(`document.body.innerText.includes('当前账号没有这段录像的访问权限')`),'denial is shown');
    await fs.writeFile(path.join(output,'resume-permission-denied.png'),(await win.webContents.capturePage()).toPNG());
    await run(`fixture.denied=false;window.dispatchEvent(new Event('focus'))`);await wait(`document.querySelector('video')?.readyState>=2`);
    assert.equal(await run(`document.querySelector('video')===window.initialVideo`),false,'permission restoration creates a fresh authorized player');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'resume-access-result.json'),JSON.stringify({passed:true,checks:['completed recording rechecks on resume','resume burst coalesces','healthy source retained','503 retains video','403 removes video','restored permission creates new player'],boundary:'Actual playback page and synthetic H264 media in Electron; authorization and metadata HTTP are fixtures. Server roster enforcement is tested separately with PostgreSQL.'},null,2));
    console.log('PASS completed replay resume: coalesced revalidation, healthy/503 preserve media, denial removes it and restored permission reloads');return;
  }
  if(trackingOnly){
    await wait(`document.body.innerText.includes('统计暂时中断')`,12000);
    assert.equal(trackingRequests[0].method,'POST');assert.equal(trackingRequests[0].body.lessonId,'lesson');assert.ok(trackingAborts>=1,'timed-out start closes the HTTP connection');
    trackingMode='ready';await run(`window.dispatchEvent(new Event('online'))`);
    await wait(`document.body.innerText.includes('有效观看计时中')`);
    assert.equal(trackingRequests.filter(r=>r.method==='POST').length,2,'recovery replaces an uncertain start with a new watch session');
    trackingMode='hold-heartbeat';await run(`window.dispatchEvent(new Event('focus'))`);
    for(let i=0;i<120&&trackingAborts<2;i++)await new Promise(resolve=>setTimeout(resolve,100));assert.ok(trackingAborts>=2,'stalled body also reaches the native eight-second deadline');
    const uncertain=trackingRequests.find(r=>r.method==='PATCH').body;
    trackingMode='ready';await run(`window.dispatchEvent(new Event('focus'))`);
    await wait(`document.body.innerText.includes('有效观看计时中')`);
    assert.equal(trackingRequests.filter(r=>r.method==='POST').length,3);
    assert.equal(trackingRequests.filter(r=>r.method==='PATCH'&&r.body.challenge===uncertain.challenge).length,1,'lost nonce is never replayed');
    assert.equal(await run(`document.querySelector('video')===window.initialVideo&&!window.initialVideo.paused`),true,'tracking failures do not interrupt media');
    trackingMode='hold-heartbeat';await run(`window.dispatchEvent(new Event('focus'))`);
    for(let i=0;i<100&&!trackingHeld.size;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(trackingHeld.size);
    const abortsBefore=trackingAborts,countBefore=trackingRequests.length;
    await run(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('第2课')).click()`);
    await wait(`!document.querySelector('video')`);for(let i=0;i<100&&trackingAborts===abortsBefore;i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.ok(trackingAborts>abortsBefore,'changing lessons aborts the old in-flight body');
    await new Promise(resolve=>setTimeout(resolve,500));assert.equal(trackingRequests.length,countBefore,'unmounted queue cannot send old-lesson requests');
    await fs.writeFile(path.join(output,'tracking-result.json'),JSON.stringify({passed:true,realH264Mp4Decoded:true,productionTimeoutMs:8000,requests:trackingRequests.map(({method,body})=>({method,lessonId:body.lessonId,state:body.state})),checks:['lesson bound at start','stalled start times out','online recovers with new session','stalled body times out','uncertain nonce not replayed','video continues','lesson change aborts and stops queue'],boundaries:'Actual playback page and native HTTP/socket deadlines over loopback, with synthetic MP4. Identity and tracking responses are fixtures; no server credit or production acceptance.'},null,2));
    console.log('PASS actual student player: lesson binding, stalled headers/body, eight-second deadlines, online/focus recovery, nonce reset, uninterrupted video and unmount cancellation');return;
  }
  await wait(`window.fixtureStats.recordings>=3`);
  assert.equal(await run(`document.querySelector('video')===window.initialVideo`), true);
  assert.equal(await run(`window.fixtureStats.loadStarts`), 0, 'background reconciliation must not reload media');
  assert.equal(await run(`window.fixtureStats.resolutions`), 1, 'same source is resolved exactly once');
  assert.ok(await run(`window.initialVideo.currentTime`) > 8, 'playback time advances through two refreshes');
  await fs.writeFile(path.join(output, 'desktop-stable-playback.png'), (await win.webContents.capturePage()).toPNG());
  await run(`window.fixture.fail=true`);
  await wait(`window.fixtureStats.recordings>=4 && document.body.innerText.includes('当前视频可继续播放')`);
  assert.equal(await run(`document.querySelector('video')===window.initialVideo && !window.initialVideo.paused`), true);
  assert.equal(await run(`window.fixtureStats.removed`), 0, 'no player removal on background network failure');
  await fs.writeFile(path.join(output, 'desktop-refresh-warning.png'), (await win.webContents.capturePage()).toPNG());
  await run(`window.fixture.fail=false`);
  await wait(`window.fixtureStats.recordings>=5 && !document.body.innerText.includes('当前视频可继续播放')`);
  assert.equal(await run(`window.fixtureStats.resolutions`), 1);
  await run(`window.fixture.malformed=true`);
  await wait(`window.fixtureStats.recordings>=6 && document.body.innerText.includes('当前视频可继续播放')`);
  assert.equal(await run(`document.querySelector('video')===window.initialVideo && !window.initialVideo.paused`),true,'malformed success must preserve the current player');
  await run(`window.fixture.malformed=false`);
  await wait(`window.fixtureStats.recordings>=7 && !document.body.innerText.includes('当前视频可继续播放')`);
  const result = { passed: true, realH264Mp4Decoded: true, stableThroughTwoPolls: true, preservedOnRefresh503: true, automaticRetryWithoutReload: true, stats: await run(`JSON.parse(JSON.stringify(window.fixtureStats))`), boundaries: 'Actual playback page and real synthetic MP4 decode; HTTP/auth/provider responses are isolated fixtures; no DB or production calls.' };
  // Start a delayed old-lesson response, then switch lessons before it resolves.
  await run(`window.fixture.delay=true`);
  await wait(`window.fixture.release!==null`);
  // Lesson navigation intentionally replaces the media; an old response must never restore it.
  await run(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('第2课')).click()`);
  await wait(`Array.from(document.querySelectorAll('h1')).some(h=>h.textContent.includes('第2课')) && !document.querySelector('video')`);
  await run(`window.fixture.release()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(await run(`document.querySelector('video')===null`), true, 'late first-lesson response cannot restore old media');
  assert.equal(await run(`window.fixtureStats.requests.filter(p=>p==='/api/sessions/other/recordings').length`), 1);
  result.lessonSwitchClearsMedia = true;
  result.staleResponseIgnored = true;
  await run(`window.fixture.delay=false;window.fixture.denied=true;Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('第1课')).click()`);
  await wait(`window.fixtureStats.recordings>=9 && !document.querySelector('video')`);
  const deniedCount=await run(`window.fixtureStats.recordings`);
  await new Promise(resolve=>setTimeout(resolve,5500));
  assert.equal(await run(`window.fixtureStats.recordings`),deniedCount,'denied access must not be retried automatically');
  result.deniedAccessStopsRetry=true;
  await win.loadURL(`http://127.0.0.1:${server.address().port}/courses/fixture/playback?sessionId=lesson&lang=zh-CN&initial-failure=1`);
  await wait(`window.fixtureStats.recordings===1 && document.body.innerText.includes('暂时无法更新录像状态')`);
  assert.equal(await run(`Boolean(document.querySelector('video'))`),false,'initial failure should not show a stale player');
  await run(`window.fixture.fail=false`);
  await wait(`window.fixtureStats.recordings>=2 && document.querySelector('video')?.readyState>=2`);
  result.initialFailureAutomaticallyRecovers=true;
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'ui-result.json'), JSON.stringify(result, null, 2));
  console.log('PASS actual playback page: real H264 decode, two polls without remount/reload, continued playback and automatic retry on 503, denied access stops retry, malformed response recovery, initial failure recovery, lesson switching; no DB');
}
app.whenReady().then(main).then(() => { win?.destroy(); server?.close(); app.quit(); }).catch(error => { console.error(error); win?.destroy(); server?.close(); app.exit(1); });
