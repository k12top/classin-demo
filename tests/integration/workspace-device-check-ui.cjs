// Actual device-check React component and CSS. Hardware/permissions/audio are
// synthetic fixtures; this does not grant or test real system permissions.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict'), http = require('node:http');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-device-'));
app.setPath('userData', profile); app.on('window-all-closed', () => {});
let server, win;
const run = code => win.webContents.executeJavaScript(code);
async function wait(code) {
 for (let i = 0; i < 160; i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 30)); }
 throw Error('Timeout: ' + code);
}
async function main() {
 await app.whenReady();
 const source = `import React from 'react';import{createRoot}from'react-dom/client';import{WorkspaceDeviceCheck}from'@/components/workspace/workspace-device-check';import{workspaceDeviceCopy}from'@/components/workspace/workspace-device-copy';
 const root=createRoot(document.getElementById('root'));window.renderDevice=locale=>{window.copy=workspaceDeviceCopy(locale);root.render(<WorkspaceDeviceCheck locale={locale}/>)};window.unmountDevice=()=>root.render(null);window.renderDevice(new URLSearchParams(location.search).get('lang')||'en');`;
 const bundle = await esbuild.build({ stdin: { contents: source, loader: 'tsx', resolveDir: root }, bundle: true, write: false, outfile: 'app.js', format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, tsconfig: path.join(root, 'tsconfig.json') });
 const assets = new Map(bundle.outputFiles.map(file => ['/' + path.basename(file.path), file.contents]));
 const fixture = `window.mode='denied';window.stopped=0;window.closedAudio=0;window.tracks=[];
 function stream(){const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;canvas.getContext('2d').fillRect(0,0,320,180);const value=canvas.captureStream(1);for(const track of value.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.stopped++;stop()};window.tracks.push(track)}return value}
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>{if(window.mode==='pending')return new Promise(resolve=>{window.grant=()=>resolve(stream())});if(window.mode==='ready')return Promise.resolve(stream());if(window.mode==='timeout')return Promise.reject(new Error('DEVICE_CAPTURE_TIMEOUT'));return Promise.reject(new DOMException('fixture',window.mode==='denied'?'NotAllowedError':window.mode==='missing'?'NotFoundError':'NotReadableError'))}}});
 window.AudioContext=class{constructor(){if(window.mode==='speaker-failure')throw Error('fixture speaker failure');this.currentTime=0;this.destination={}}close(){window.closedAudio++;return Promise.resolve()}createMediaStreamSource(){return{connect(){}}}createAnalyser(){return{fftSize:256,getByteTimeDomainData(data){data.fill(140)}}}createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}createOscillator(){return{frequency:{value:0},connect(){},start(){},stop(){this.onended?.()}}}};
 window.clickDevice=key=>[...document.querySelectorAll('button')].find(button=>button.textContent===window.copy[key]).click();`;
 server = http.createServer((req, res) => {
  if (assets.has(req.url)) { res.setHeader('content-type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript'); return res.end(assets.get(req.url)); }
  res.setHeader('content-type', 'text/html;charset=utf-8'); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f5f5f5;font:13px system-ui}*{box-sizing:border-box}#root{margin:24px auto;padding:20px;background:white;border-radius:12px;width:min(440px,calc(100% - 24px))}</style><link rel="stylesheet" href="/app.css"><div id="root"></div><script>${fixture}</script><script src="/app.js"></script>`);
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
 const errors = []; win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
 const output = path.join(root, 'outputs/workspace-device-check'); fs.mkdirSync(output, { recursive: true });
 const layouts = [];
 for (const locale of ['zh-CN', 'zh-TW', 'en', 'vi']) for (const width of [1366, 1024, 390, 320]) {
  win.setContentSize(width, 780); await win.loadURL(`http://127.0.0.1:${server.address().port}/?lang=${locale}`);
  await wait(`document.querySelector('[role=region]')?.getAttribute('aria-label')===window.copy.title`);
  await run(`window.clickDevice('checkCamera')`);
  await wait(`document.querySelector('[role=alert]')?.textContent===window.copy.permissionDenied`);
  assert.equal(await run(`document.querySelector('[role=region]').getAttribute('aria-busy')`), 'false');
  const geometry = await run(`({viewport:innerWidth,page:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('button,video,[role=alert]')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>el.tagName)})`);
  assert.ok(geometry.page <= width + 1); assert.deepEqual(geometry.overflow, []);
  fs.writeFileSync(path.join(output, `${locale}-${width}.png`), (await win.webContents.capturePage()).toPNG()); layouts.push({ locale, width, geometry });
 }
 await run(`window.renderDevice('zh-TW')`);
 await wait(`document.querySelector('[role=alert]')?.textContent===window.copy.permissionDenied`);
 assert.equal(await run(`document.querySelector('[role=alert]').textContent.includes('尚未允許')`), true, 'existing error follows a locale change');
 for (const [mode, expected] of [['missing', 'notFound'], ['busy', 'inUse'], ['timeout', 'captureTimeout']]) {
  await run(`window.mode=${JSON.stringify(mode)};window.clickDevice('checkCamera')`);
  await wait(`document.querySelector('[role=alert]')?.textContent===window.copy[${JSON.stringify(expected)}]&&!document.querySelector('button').disabled`);
 }
 await run(`window.mode='pending';window.clickDevice('checkCamera')`);
 await wait(`document.querySelector('[role=status]')?.textContent===window.copy.preparing&&document.querySelector('button').disabled`);
 await run(`window.unmountDevice()`); await wait(`!document.querySelector('[role=region]')`);
 await run(`window.grant()`); await wait(`window.stopped===1`);
 await run(`window.mode='ready';window.renderDevice('vi')`); await wait(`!!document.querySelector('[role=region]')`);
 await run(`window.clickDevice('checkCamera')`); await wait(`document.querySelector('video')?.srcObject&&!document.querySelector('[role=status]')`);
 await run(`window.clickDevice('stopCheck')`); await wait(`document.querySelector('video').srcObject===null&&window.stopped===2`);
 await run(`window.clickDevice('checkMicrophone')`); await wait(`document.querySelector('progress')?.value>0`);
 await run(`window.tracks.at(-1).onended()`); await wait(`document.querySelector('[role=alert]')?.textContent===window.copy.deviceDisconnected&&!document.querySelector('progress')&&window.closedAudio===1`);
 await run(`window.mode='speaker-failure';window.clickDevice('testSpeaker')`); await wait(`document.querySelector('[role=alert]')?.textContent===window.copy.speakerFailed`);
 assert.deepEqual(errors, []);
 fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ passed: true, boundary: 'Actual React component/CSS; synthetic hardware, permission outcomes and audio. Timeout outcome is injected; timeout disposal is separately unit-tested.', layouts, checks: ['localized permission denial and retry', 'locale change preserves and translates an existing error', 'missing/busy/timeout reasons restore controls', 'pending capture has accessible status', 'late grant after unmount is stopped', 'camera stop detaches stream', 'microphone disconnect stops tracks and audio', 'speaker failure is localized'] }, null, 2));
 console.log('PASS 16 device-check layouts, localized errors, retry, pending status, late-grant cleanup, stop and disconnect');
}
function cleanup() { win?.destroy(); server?.close(); fs.rmSync(profile, { recursive: true, force: true }); }
main().then(() => { cleanup(); app.exit(0); }, error => { console.error(error); cleanup(); app.exit(1); });
