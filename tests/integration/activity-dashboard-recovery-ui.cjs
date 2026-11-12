// Isolated Electron exercises the actual dashboard, charts, history and locale provider over loopback HTTP.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'activity-recovery-'));
app.setPath('userData',profile);app.on('window-all-closed',()=>{});
let win,server,mode='ready';const held=new Set(),checks=[];
const run=expression=>win.webContents.executeJavaScript(expression);
async function wait(expression){for(let i=0;i<200;i++){if(await run(expression))return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Timeout: '+expression);}
const quality={answered:1,correct:1,incorrect:0,partial:0,pending:0,withheld:0,earnedPoints:10,gradedPoints:10};
const startedAt='2026-11-11T04:00:00.000Z';
const activity={id:'question-one',title:'2 + 2 = ?',kind:'quiz',status:'closed',version:1,presented:false,presentedQuestion:0,durationSec:null,startedAt,deadlineAt:null,createdAt:startedAt,updatedAt:startedAt,responseCount:1,questionCount:1};
const response={id:'answer-one',userId:'student',displayName:'Fixture Student',answers:{q:['a']},grading:{q:10},feedback:null,submittedAt:startedAt,updatedAt:startedAt,version:1};
function overview(teacher){
 const ownQuality=teacher?quality:{...quality,correct:0,withheld:1,earnedPoints:0,gradedPoints:0};
 return {canManage:teacher,live:false,activityCount:1,questionCount:1,studentCount:teacher?2:1,participants:1,submissions:1,participation:100,accuracy:teacher?100:null,quality:ownQuality,students:teacher?[{userId:'student',displayName:'Fixture Student',avatar:'',online:false,submissions:1,participation:100,accuracy:100,quality}]:[],activities:[{...activity,accuracy:teacher?100:null,quality:ownQuality,questions:[{id:'q',prompt:activity.title,accuracy:teacher?100:null,quality:ownQuality,responseCount:1}]}]};
}
function detail(teacher){return {...activity,resultsVisible:teacher,definition:{questions:[{id:'q',type:'single',prompt:activity.title,points:10,options:[{id:'a',text:'4'},{id:'b',text:'5'}],...(teacher?{correct:['a']}: {})}]},ownResponse:teacher?null:{...response,grading:null},responses:teacher?[response]:[],responseCursor:null,statistics:null};}
async function main(){
 await app.whenReady();
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{ActivityDashboard}from'@/components/classroom/activity-dashboard';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<I18nProvider initialLocale={p.get('lang')}><ActivityDashboard sessionId={'lesson-'+p.get('role')} review canSeekActivity={()=>false} onSeekActivity={()=>{}}/></I18nProvider>);`;
 const bundle=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,outfile:'app.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'timezone',setup(build){build.onResolve({filter:/^@\/lib\/use-time-zone$/},()=>({path:'timezone',namespace:'mock'}));build.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const useTimeZone=()=>({timeZone:"UTC"})',loader:'js'}));}}]});
 const assets=new Map(bundle.outputFiles.map(file=>['/'+path.basename(file.path),file.contents]));
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(assets.has(url.pathname)){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(assets.get(url.pathname));}
  if(url.pathname.startsWith('/api/')){
   res.setHeader('content-type','application/json');
   if(url.searchParams.has('versionOnly'))return res.end('{"revision":1}');
   if(mode==='drop')return res.destroy();
   if(mode==='hold'){held.add(res);res.on('close',()=>held.delete(res));return;}
   if(mode==='denied'){res.statusCode=403;return res.end('{"error":"fixture denial"}');}
   const teacher=url.pathname.includes('lesson-teacher');return res.end(JSON.stringify(url.searchParams.has('overview')?overview(teacher):detail(teacher)));
  }
  res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--card:0 0% 100%;--foreground:240 10% 10%;--muted-foreground:240 4% 40%;--muted:240 5% 95%;--border:240 6% 88%}body{margin:0;font-family:system-ui}*{box-sizing:border-box}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
 const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const locales=[['zh-CN','课堂互动记录','我的互动记录','等待老师下发答案','刷新看板','跳至录像','没有对应的可播放录像'],['zh-TW','課堂互動紀錄','我的互動紀錄','等待老師下發答案','重新整理看板','跳至錄影','沒有對應的可播放錄影'],['en','Lesson interactions','My interactions','Waiting for your teacher to release answers','Refresh dashboard','Jump to recording','No matching playable recording'],['vi','Tương tác trong buổi học','Tương tác của tôi','Đang chờ giáo viên công bố đáp án','Làm mới tổng quan','Đến video','Không có video tương ứng để phát']];
 const output=path.join(root,'outputs/activity-dashboard-recovery');fs.mkdirSync(output,{recursive:true});
 for(const [locale,teacherTitle,studentTitle,waiting,refresh,jump,unavailable] of locales){
  for(const role of ['teacher','student'])for(const width of [1366,320]){
   win.setContentSize(width,900);mode='ready';await win.loadURL(`http://127.0.0.1:${server.address().port}/?lang=${locale}&role=${role}`);
   const expected=role==='teacher'?teacherTitle:studentTitle;
   await wait(`document.querySelector('[data-activity-dashboard] h3')?.textContent===${JSON.stringify(expected)}`);
   assert.equal(await run(`document.querySelector('[data-activity-dashboard] header button').getAttribute('aria-label')`),refresh);
   await wait(`document.querySelector('[data-overview-echart] svg')`);
   await run(`document.querySelector('[data-activity-dashboard] article>button').click()`);
   await wait(`document.querySelector('[data-activity-history]')`);
   assert.equal(await run(`document.querySelector('[data-activity-dashboard] article>button[disabled]').textContent`),jump);
   assert.equal(await run(`document.querySelector('[data-activity-dashboard] article>button[disabled]').title`),unavailable);
   if(role==='student'){
    assert.ok(await run(`document.querySelector('[data-activity-history]').textContent.includes(${JSON.stringify(waiting)})`));
    assert.equal(await run(`document.querySelector('[data-activity-history] select')`),null);
    assert.equal(await run(`document.querySelector('[data-activity-history] [data-result="correct"], [data-activity-history] [data-judgment]')`),null);
   }else assert.equal(await run(`document.querySelector('[data-activity-history] select').options.length`),2);
   const bounds=await run(`(()=>{const p=document.querySelector('[data-activity-dashboard]');return{viewport:innerWidth,page:document.documentElement.scrollWidth,panel:p.getBoundingClientRect().width,overflow:[...p.querySelectorAll('button,select,h3,h4')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).map(e=>e.textContent)}})()`);
   assert.ok(bounds.page<=bounds.viewport+1,JSON.stringify({locale,role,width,bounds}));assert.deepEqual(bounds.overflow,[],JSON.stringify({locale,role,width,bounds}));
   const image=await win.webContents.capturePage();fs.writeFileSync(path.join(output,`${locale}-${role}-${width}.png`),image.toPNG());checks.push({locale,role,width,bounds});
  }
 }
 // A real HTTP socket failure must end loading, preserve previously authorized
 // data, and recover on focus. A denial must clear it instead.
 mode='hold';await run(`document.querySelector('[data-activity-dashboard] header button').click()`);
 for(let i=0;i<100&&!held.size;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(held.size);
 mode='drop';for(const response of held)response.destroy();held.clear();
 await wait(`!!document.querySelector('[data-activity-dashboard] [role=status]')&&!document.querySelector('[data-activity-dashboard] header button').disabled`);
 assert.ok(await run(`!!document.querySelector('[data-activity-history]')`),'transient failure retains the prior authorized view');
 mode='ready';await run(`window.dispatchEvent(new Event('focus'))`);
 await wait(`!document.querySelector('[data-activity-dashboard] [role=status]')`);
 mode='denied';await run(`document.querySelector('[data-activity-dashboard] header button').click()`);
 await wait(`!document.querySelector('[data-activity-history]')&&!!document.querySelector('[data-activity-dashboard] [role=status]')`);
 mode='ready';await run(`window.dispatchEvent(new Event('focus'))`);await wait(`!!document.querySelector('[data-overview-charts]')`);
 mode='hold';await win.loadURL(`http://127.0.0.1:${server.address().port}/?lang=vi&role=student`);
 await wait(`document.querySelector('[data-activity-dashboard] [role=status]')?.textContent==='Đang tải lịch sử tương tác…'`);
 for(let i=0;i<100&&!held.size;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(held.size);
 mode='drop';for(const response of held)response.destroy();held.clear();
 await wait(`document.querySelector('[data-activity-dashboard] [role=status]')?.textContent.includes('Không tải được lịch sử tương tác.')&&!document.querySelector('[data-activity-dashboard] header button').disabled`);
 assert.equal(await run(`document.querySelector('[data-overview-charts]')`),null);
 mode='ready';await run(`window.dispatchEvent(new Event('focus'))`);await wait(`!!document.querySelector('[data-overview-charts]')&&!document.querySelector('[data-activity-dashboard] [role=status]')`);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({passed:true,boundary:'Actual dashboard, charts, history and I18nProvider in isolated Electron. HTTP data/identity and timezone are fixtures; no real account, device media or weak-network proxy acceptance.',checks,recovery:['socket failure clears busy and retains content','focus retries','403 clears content','focus restores permitted content','initial socket failure ends loading with retry','initial read recovers on focus']},null,2));
 console.log('PASS 16 locale/role/width layouts, unreleased student answer view, initial/refresh socket failures, permission denial and focus recovery');
}
function cleanup(){for(const response of held)response.destroy();win?.destroy();server?.close();fs.rmSync(profile,{recursive:true,force:true});}
main().then(()=>{cleanup();app.exit(0);},error=>{console.error(error);cleanup();app.exit(1);});
