/* eslint-disable @typescript-eslint/no-require-imports -- Actual settings dialog and video rail, simulated setting persistence. */
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
let window, server;
async function main() {
  const cache = path.join(root, 'node_modules/.cache/classroom-stage-settings-ui');
  await fs.mkdir(cache, { recursive: true });
  const bundle = await esbuild.build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';
    import{DeviceSettings,LiveRail}from'@/components/classroom/classroom-v3';
    const noop=()=>{},member=(userId,role)=>({userId,role,displayName:userId,avatar:'',online:true,onStage:true,stageState:'accepted',screenShareState:'idle',screenShareRequestedAt:null,microphoneAllowed:true,cameraAllowed:true,chatMuted:false,whiteboardWritable:false,handRaisedAt:null,rewardCount:0});
    const members=[member('主讲老师','teacher'),...Array.from({length:12},(_,i)=>member('学生'+(i+1),'student'))];
    const media={participants:[],connectionState:'connected',local:{microphoneOn:false,cameraOn:false}};
    function Fixture(){const[limit,setLimit]=useState(null),[defaultLimit,setDefaultLimit]=useState(null),[roster,setRoster]=useState(members),[bypass,setBypass]=useState(true),[busy,setBusy]=useState(false),[role,setRole]=useState('teacher'),[grant,setGrant]=useState(false),[theme,setTheme]=useState('light');
      window.fixture={addStudent:()=>setRoster(current=>[...current,member('后来进入的学生','student')]),setMode:mode=>{setDefaultLimit(mode==='small'?null:30);setLimit(null)},setRole:(role,allowed=false)=>{setRole(role);setGrant(allowed)},setTheme};
      const runtime={revision:1,status:'live',recordingStartMode:'classStart',stageStudentLimit:limit,stageInviteBypassLimit:bypass,members:roster};
      const save=async(studentLimit,inviteBypassLimit)=>{setBusy(true);await fetch('/settings',{method:'POST',body:JSON.stringify({studentLimit,inviteBypassLimit})});setLimit(studentLimit);setBypass(inviteBypassLimit);setBusy(false)};
      return <main className="classroom-v3-shell is-classin-layout fixture"><LiveRail members={roster} media={media} provider={null} currentUserId="主讲老师" canManage={false} canReward={false} busy={false} maxStudentSeats={limit} collapsed={false} onToggleCollapsed={noop} onSpotlight={noop} onToggleLocalMicrophone={noop} onToggleLocalCamera={noop} onManageMedia={noop} onRemoveStage={noop} onReward={noop} seatOrder={[]} boardSourceIds={new Set()} onReorder={noop} onPlaceOnBoard={noop} previewPlacesOnBoard={false}/><DeviceSettings open={true} theme={theme} onThemeChange={setTheme} provider={null} media={media} runtime={runtime} canManageRecording={role==='teacher'} canManageStage={role==='teacher'||role==='assistant'&&grant} stageStudentLimit={limit} stageDefaultStudentLimit={defaultLimit} stageSettingsBusy={busy} onStageSettingsChange={save} canUseAuxiliaryCamera={false} onAssistantPermission={noop} captionDisplayMode="bilingual" captionBackgroundMode="text" captionBackgroundColor="#202124" onRecordingStartModeChange={noop} onCaptionDisplayModeChange={noop} onCaptionBackgroundModeChange={noop} onCaptionBackgroundColorChange={noop} onClose={noop}/></main>}
    createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><Fixture/></I18nProvider>);
  ` }, bundle: true, write: false, outfile: path.join(cache, 'fixture.js'), format: 'iife', platform: 'browser', define: { 'process.env': '{}' }, tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'private-components', setup(build) {
    build.onLoad({ filter: /classroom-v3\.tsx$/ }, async args => ({ contents: await fs.readFile(args.path, 'utf8') + '\nexport {DeviceSettings,LiveRail};', resolveDir: path.dirname(args.path), loader: 'tsx' }));
  } }] });
  const cssPath = path.join(cache, 'global.css');
  execFileSync('node', [require.resolve('tailwindcss/lib/cli.js'), '-i', path.join(root, 'src/app/globals.css'), '-o', cssPath, '--minify'], { cwd: root, stdio: 'pipe' });
  const css = await fs.readFile(cssPath, 'utf8') + '\n' + (await Promise.all(['classroom-classin.css', 'classroom-light.css'].map(name => fs.readFile(path.join(root, 'src/app', name), 'utf8')))).join('\n') + '\n' + bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
  const requests = [];
  server = http.createServer(async (request, response) => {
    if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'application/javascript'); return response.end(bundle.outputFiles.find(file => file.path.endsWith('.js')).text); }
    if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); return response.end(css); }
    if (request.url === '/settings') { let body = ''; for await (const chunk of request) body += chunk; requests.push(JSON.parse(body)); await new Promise(resolve => setTimeout(resolve, 200)); response.setHeader('Content-Type', 'application/json'); return response.end('{}'); }
    response.end('<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>.fixture{min-height:100dvh}.fixture .classroom-v3-seats{overflow:auto}</style><div id="root"></div><script src="/fixture.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); await app.whenReady();
  window = new BrowserWindow({ show: false, width: 1440, height: 1100, webPreferences: { backgroundThrottling: false, partition: 'stage-settings-' + Date.now() } });
  const errors = []; window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  await window.loadURL(`http://127.0.0.1:${server.address().port}/?lang=zh-CN`);
  const run = async code => { try { return await window.webContents.executeJavaScript(code); } catch (error) { throw new Error(String(error) + '; code: ' + code + '; renderer: ' + errors.join(';')); } };
  const wait = async code => { const end = Date.now() + 15000; while (!await run(`Boolean(${code})`)) { if (Date.now() > end) throw new Error('timeout ' + code + '; ' + errors.join(';')); await new Promise(resolve => setTimeout(resolve, 35)); } };
  await wait(`document.querySelector('.classroom-v3-device-dialog') || document.querySelector('[role="dialog"]')`);
  assert.equal(await run(`document.querySelector('.classroom-v3-quality-options')`), null);
  assert.equal(await run(`document.body.textContent.includes('摄像头画质') || document.body.textContent.includes('1920 × 1080')`), false);
  assert.ok(await run(`document.body.textContent.includes('设备设置')`));
  assert.ok(await run(`document.querySelector('.classroom-v3-background-options')`));
  const mediaOutput = path.join(root, 'outputs/classroom-media-optimization-2026-10-22');
  await fs.mkdir(mediaOutput, { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
    window.setContentSize(width, height); await wait(`innerWidth===${width}`);
    await run(`document.querySelector('.classroom-v3-device-body').scrollTop=0`);
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.ok(await run(`document.documentElement.scrollWidth<=innerWidth`));
    await fs.writeFile(path.join(mediaOutput, 'device-settings-' + name + '.png'), (await window.webContents.capturePage()).toPNG());
  }
  window.setContentSize(1440, 1100); await wait('innerWidth===1440');
  const rule = 'select[name="stageSeatRule"]';
  const ruleChange = async value => { await run(`(()=>{const e=document.querySelector(${JSON.stringify(rule)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`); };
  const submit = async () => { await run(`document.querySelector(${JSON.stringify(rule)}).closest('form').requestSubmit()`); await wait(`document.body.textContent.includes('正在保存')`); await wait(`!document.querySelector(${JSON.stringify(rule)}).closest('fieldset').disabled`); };
  await wait(`document.querySelector(${JSON.stringify(rule)})`);
  assert.equal(await run(`document.querySelectorAll('.classroom-v3-seat').length`), 13);
  assert.equal(await run(`!!document.querySelector('input[type="number"]')`), false);
  assert.ok(await run(`document.body.textContent.includes('当前 12 名学生')`));
  await run('fixture.addStudent()'); await wait(`document.body.textContent.includes('当前 13 名学生')`);
  assert.equal(await run(`document.querySelectorAll('.classroom-v3-seat').length`),14);
  await run(`Array.from(document.querySelectorAll('input[type="checkbox"]')).find(e=>e.closest('label').textContent.includes('允许老师邀请')).click()`);
  await wait(`document.body.textContent.includes('正在保存')`); await wait(`!document.querySelector(${JSON.stringify(rule)}).closest('fieldset').disabled`);
  assert.deepEqual(requests,[{studentLimit:null,inviteBypassLimit:false}], 'changing overflow never freezes the automatic student count');
  await ruleChange('custom'); await wait(`document.querySelector('input[type="number"]')`);
  assert.equal(await run(`document.querySelector('input[type="number"]').value`),'13');
  await run(`(()=>{const e=document.querySelector('input[type="number"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'9');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await submit(); assert.deepEqual(requests.at(-1),{studentLimit:9,inviteBypassLimit:false});
  for (const role of ['student','assistant']) { await run(`fixture.setRole(${JSON.stringify(role)})`);await wait(`!document.querySelector(${JSON.stringify(rule)})`); }
  await run(`fixture.setRole('assistant',true)`); await wait(`document.querySelector(${JSON.stringify(rule)})`);
  await ruleChange('default'); await submit(); assert.deepEqual(requests.at(-1),{studentLimit:null,inviteBypassLimit:false});
  assert.ok(await run(`document.body.textContent.includes('当前 13 名学生')`));
  const output = path.join(root,'outputs/classroom-stage-defaults-2026-10-17');await fs.mkdir(output,{recursive:true});
  for(const mode of ['small','large']) {
    await run(`fixture.setMode(${JSON.stringify(mode)})`);
    await wait(mode==='small'?`document.body.textContent.includes('当前 13 名学生')`:`document.body.textContent.includes('本节课常规学生席位：30 人')`);
    for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]) {
      window.setContentSize(width,height);await wait(`innerWidth===${width}`);
      await run(`document.querySelector(${JSON.stringify(rule)}).closest('fieldset').scrollIntoView({block:'center',behavior:'instant'})`);
      await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.ok(await run(`document.documentElement.scrollWidth<=innerWidth`));
      const bounds=await run(`(()=>{const r=document.querySelector(${JSON.stringify(rule)}).closest('fieldset').getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()`);
      assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=height,JSON.stringify(bounds));
      await fs.writeFile(path.join(output,mode+'-'+name+'.png'),(await window.webContents.capturePage()).toPNG());
    }
  }
  await ruleChange('custom');await wait(`document.querySelector('input[type="number"]')`);assert.equal(await run(`document.querySelector('input[type="number"]').value`),'30');
  assert.deepEqual(errors, []);
  console.log('PASS actual settings dialog: small-class seats follow entrants and late arrivals; overflow keeps automatic mode, fixed limits apply/reset, large classes default to thirty, authorized roles only, desktop/mobile fit. Setting HTTP persistence is simulated.');
}
main().then(() => cleanup(0), error => { console.error(error); cleanup(1); });
function cleanup(code) { window?.destroy(); server?.close(); app.exit(code); }
