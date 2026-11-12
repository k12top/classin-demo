/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Electron acceptance for the actual playback page. */
// clients/desktop/node_modules/.bin/electron tests/integration/playback-overlap-ui.cjs
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

async function main() {
  const output = path.join(root, 'outputs/playback-overlap');
  const cache = path.join(root, 'node_modules/.cache/playback-overlap');
  await fs.mkdir(output, { recursive: true }); await fs.mkdir(cache, { recursive: true });
  const mediaFile = process.env.CLASSROOM_PLAYBACK_TEST_MEDIA || path.join(cache, 'fixture.mp4');
  if(!process.env.CLASSROOM_PLAYBACK_TEST_MEDIA)execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=12', '-t', '50', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mediaFile]);
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
    window.fixtureUser={userId:'teacher',name:'teacher',displayName:'测试老师',role:'teacher',avatar:''};
    const nativeFetch=window.fetch.bind(window), stats=window.fixtureStats={recordings:0,resolutions:0,requests:[],loadStarts:0,removed:0};
    window.fixture={fail:false,delay:false,release:null};
    const lessons=['lesson','other'].map((id,i)=>({id,title:'回放稳定性验证 · 第'+(i+1)+'课',status:'finished',startTime:'2026-10-23T08:00:00Z',endTime:'2026-10-23T10:00:00Z',_count:{recordings:i?0:1}}));
    window.fetch=async(input,init)=>{const url=new URL(String(input),location.href);stats.requests.push(url.pathname);let payload={};let status=200;
      if(url.pathname==='/api/courses/fixture')payload={course:{id:'fixture',name:'回放稳定性验证',teacherName:'测试老师',status:'finished',canTeach:true}};
      else if(url.pathname==='/api/courses/fixture/sessions')payload={sessions:lessons};
      else if(url.pathname==='/api/sessions/lesson/recordings'){stats.recordings++;payload={recordings:[{id:'first',segment:1,status:'completed',startedAt:'2026-10-23T08:00:00Z',stoppedAt:'2026-10-23T08:00:50Z',playbackFormat:'mp4',playbackUrl:'/api/sessions/lesson/recordings/first/play'},{id:'second',segment:2,status:'completed',startedAt:'2026-10-23T08:00:10Z',stoppedAt:'2026-10-23T08:01:00Z',playbackFormat:'mp4',playbackUrl:'/api/sessions/lesson/recordings/second/play'}],refreshAfterMs:null};}
      else if(url.pathname.includes('/summary'))payload={summary:null,captions:[{id:'caption-first',speakerName:'Teacher',text:'First-only caption',translations:{},occurredAt:'2026-10-23T08:00:05Z'},{id:'caption-one',speakerName:'Teacher',text:'Overlap caption',translations:{},occurredAt:'2026-10-23T08:00:20Z'},{id:'caption-second',speakerName:'Teacher',text:'Second-only caption',translations:{},occurredAt:'2026-10-23T08:00:55Z'}],canManage:false};
      else if(url.pathname.endsWith('/classroom/activities'))payload={activities:[{id:'activity-one',title:'Overlap activity',status:'closed',startedAt:'2026-10-23T08:00:20Z'}]};
      else if(url.pathname.includes('/recordings/')&&url.pathname.endsWith('/play')){stats.resolutions++;payload={url:location.origin+'/media.mp4',format:'mp4'};}
      else return nativeFetch(input,init);
      return Response.json(payload,{status});
    };
    const params=Promise.resolve({id:'fixture'}),searchParams=Promise.resolve({});
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Suspense fallback={<p>准备回放…</p>}><Page params={params} searchParams={searchParams}/></Suspense></I18nProvider>);
  `;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, outfile: path.join(cache, 'fixture.js'), platform: 'browser', format: 'iife', define: { 'process.env': '{}' }, tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'isolated-playback', setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined);
    build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: root }));
  } }] });
  const cssFile = path.join(cache, 'fixture.css');
  execFileSync('node', [require.resolve('tailwindcss/lib/cli.js'), '-i', path.join(root, 'src/app/globals.css'), '-o', cssFile, '--minify'], { stdio: 'pipe' });
  const css = await fs.readFile(cssFile);
  server = http.createServer((req, res) => {
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
  await win.loadURL(`http://127.0.0.1:${server.address().port}/courses/fixture/playback?sessionId=lesson&lang=zh-CN`);
  await wait(`document.querySelector('video')?.readyState>=2 && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='片段 2')`);
  await run(`window.firstVideo=document.querySelector('video');Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='片段 2').click()`);
  await wait(`document.querySelector('video')!==window.firstVideo && document.querySelector('video')?.readyState>=2`);
  await run(`window.secondVideo=document.querySelector('video');window.secondVideo.muted=true`);
  await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Overlap caption'))`);
  const captionLabel=await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Overlap caption')).textContent`);
  assert.match(captionLabel,/片段 2.*00:10/,'caption label uses the selected overlapping recording');
  await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Overlap caption')).click()`);
  await wait(`document.querySelector('video')===window.secondVideo && Math.abs(window.secondVideo.currentTime-7)<1.5`);
  await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Overlap activity'))`);
  await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Overlap activity')).click()`);
  await wait(`document.querySelector('video')===window.secondVideo && Math.abs(window.secondVideo.currentTime-10)<1.5`);
  await run(`window.oldPlayCalls=0;window.secondVideo.play=()=>{window.oldPlayCalls++;return Promise.resolve()};Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('First-only caption')).click()`);
  await wait(`document.querySelector('video')!==window.secondVideo && document.querySelector('video')?.readyState>=2 && Math.abs(document.querySelector('video').currentTime-2)<1.5`);
  assert.equal(await run('window.oldPlayCalls'),0,'switching segments must not play the old video');
  await run(`window.switchedFirstVideo=document.querySelector('video');window.oldPlayCalls=0;window.switchedFirstVideo.play=()=>{window.oldPlayCalls++;return Promise.resolve()};Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Second-only caption')).click()`);
  await wait(`document.querySelector('video')!==window.switchedFirstVideo && document.querySelector('video')?.readyState>=2 && Math.abs(document.querySelector('video').currentTime-42)<1.5`);
  assert.equal(await run('window.oldPlayCalls'),0,'switching back must not play the old video');
  assert.deepEqual(errors,[]);console.log('PASS actual playback page seeks overlapping captions and activities and switches recordings without playing the old video');

}
app.whenReady().then(main).then(() => { win?.destroy(); server?.close(); app.quit(); }).catch(error => { console.error(error); win?.destroy(); server?.close(); app.exit(1); });
