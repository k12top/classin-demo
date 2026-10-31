/* eslint-disable @typescript-eslint/no-require-imports -- Real roster and CSS in Chromium; simulated presence clock. */
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..');
let win,server;
async function main(){
 const output=process.env.CLASSROOM_AWAY_OUTPUT||path.join(root,'outputs/classroom-away-2026-10-31');
 const cache=path.join(root,'node_modules/.cache/classroom-away');await fs.mkdir(cache,{recursive:true});await fs.mkdir(output,{recursive:true});
 const contents=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{TestMemberPanel}from'@/components/classroom/classroom-v3';import{reconcileClassroomRtcPresence}from'@/lib/classroom/rtc-presence';
 localStorage.setItem('locale','zh-CN');const base=1000000;let time=0,recovered=false;window.actions=[];
 const student={userId:'aaron',displayName:'Aaron',role:'student',avatar:'',online:true,connectionStatus:'online',lastSeenAt:new Date(base).toISOString(),reconnectUntil:new Date(base+120000).toISOString(),onStage:true,stageState:'accepted',screenShareState:'idle',screenShareRequestedAt:null,microphoneAllowed:true,cameraAllowed:true,chatMuted:false,whiteboardWritable:true,handRaisedAt:new Date(base).toISOString(),rewardCount:0,rtcUids:[123]};
 function Fixture(){const[revision,setRevision]=useState(0);window.fixture={advance:ms=>{time=ms;setRevision(x=>x+1)},recover:()=>{recovered=true;setRevision(x=>x+1)}};
 const seen=recovered?base+time:base;const aaron={...student,lastSeenAt:new Date(seen).toISOString(),reconnectUntil:new Date(seen+120000).toISOString()};
 const roster=[{...student,userId:'teacher',displayName:'nkwill',role:'teacher',handRaisedAt:null,lastSeenAt:new Date(base+time).toISOString(),reconnectUntil:new Date(base+time+120000).toISOString()},aaron,{...student,userId:'jiubao',displayName:'jiubao',handRaisedAt:null,lastSeenAt:new Date(base+time).toISOString(),reconnectUntil:new Date(base+time+120000).toISOString()}];
 const members=reconcileClassroomRtcPresence(roster,{connectionState:'connected',participants:[]},base+time);
 return <main className='classroom-v3-shell is-classin-layout fixture-roster' data-responsive-workspace='true' data-revision={revision}><TestMemberPanel members={members} presenceHealthy={true} canManage={true} canRequestScreenShare={false} busy={null} screenParticipants={[]} onAction={action=>window.actions.push(action)}/></main>}
 createRoot(document.getElementById('root')).render(<I18nProvider initialLocale='zh-CN'><Fixture/></I18nProvider>);`;
 const bundle=await esbuild.build({stdin:{contents,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',tsconfig:path.join(root,'tsconfig.json'),define:{'process.env':'{}'},plugins:[{name:'roster-export',setup(build){
 build.onLoad({filter:/\.module\.css$/},()=>({contents:'export default {}',loader:'js'}));
 build.onLoad({filter:/classroom-v3\.tsx$/},async args=>({contents:await fs.readFile(args.path,'utf8')+'\nexport {MemberPanel as TestMemberPanel};',loader:'tsx',resolveDir:path.dirname(args.path)}));
 }}]});
 const cssPath=path.join(cache,'fixture.css');execFileSync('node',[require.resolve('tailwindcss/lib/cli.js'),'-i',path.join(root,'src/app/globals.css'),'-o',cssPath,'--minify'],{stdio:'pipe'});const css=(await Promise.all([cssPath,...['classroom-classin.css','classroom-light.css','classroom-responsive.css'].map(name=>path.join(root,'src/app',name))].map(file=>fs.readFile(file,'utf8')))).join('\n');
 server=http.createServer((req,res)=>{
 if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles[0].text)}
 if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');return res.end(css)}
 res.end(`<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#f5f5f7}.fixture-roster.classroom-v3-shell{display:block;width:min(100%,420px);height:100vh;margin:0 auto;background:white;overflow:auto}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 win=new BrowserWindow({width:1440,height:900,show:false,webPreferences:{backgroundThrottling:false}});const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error'||e.level>=3)errors.push(e.message)});
 const run=code=>win.webContents.executeJavaScript(code);const wait=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,30))}throw Error('Timed out: '+code+'; '+errors.join('; '))};
 const checks=[];
 for(const[width,height]of[[1440,900],[390,844]]){
 win.setContentSize(width,height);await win.loadURL(`http://127.0.0.1:${server.address().port}/?lang=zh-CN`);await wait('window.fixture && document.querySelectorAll(".classroom-v3-member-list article").length===3');
 const aaron=`[...document.querySelectorAll('.classroom-v3-member-list article')].find(e=>e.querySelector('strong').textContent==='Aaron')`;
 await run('fixture.advance(45001)');await wait(`(${aaron}).textContent.includes('重连中')`);
 assert.ok(!(await run(`(${aaron}).textContent.includes('离席')`)));
 await fs.writeFile(path.join(output,`reconnecting-${width}.png`),(await win.webContents.capturePage()).toPNG());
 await run('fixture.advance(119999)');await wait(`(${aaron}).textContent.includes('重连中')`);
 await run('fixture.advance(120000)');await wait(`(${aaron}).textContent.includes('离席')`);
 assert.equal(await run(`document.querySelectorAll('.classroom-v3-member-list article').length`),3);
 assert.equal(await run(`(${aaron}).querySelectorAll('button').length`),0);
 assert.equal(await run(`(${aaron}).draggable`),false);
 assert.ok(!(await run(`(${aaron}).textContent.includes('已在台上')`)));
 assert.ok(await run(`document.querySelector('.classroom-roster-summary').textContent.includes('离席 1')`));
 assert.ok(await run(`document.querySelector('.classroom-v3-panel-heading').textContent.includes('2 人在线')`));
 assert.equal(await run(`document.querySelector('.classroom-v3-member-list article:last-child strong').textContent`),'Aaron');
 assert.ok(await run(`document.documentElement.scrollWidth<=innerWidth`));
 await fs.writeFile(path.join(output,`away-${width}.png`),(await win.webContents.capturePage()).toPNG());
 await run('fixture.recover()');await wait(`!(${aaron}).textContent.includes('离席')`);
 assert.ok(await run(`document.querySelector('.classroom-v3-panel-heading').textContent.includes('3 人在线')`));
 assert.equal(await run('actions.length'),0);checks.push({width,height,transition:'online → reconnecting at 45s → away at 120s → online after heartbeat',rosterRetained:true,awayExcludedFromOnlineCount:true,noClassroomActionsSent:true});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'ui-checks.json'),JSON.stringify({passed:true,boundary:'Real MemberPanel, presence reconciliation and shipped CSS in Chromium; simulated clock and member payloads.',checks},null,2));console.log('PASS roster presence transitions, away counts, controls, return and responsive layout');
}
app.whenReady().then(main).then(()=>{win?.destroy();server?.close();app.quit()}).catch(e=>{console.error(e);win?.destroy();server?.close();app.exit(1)});
