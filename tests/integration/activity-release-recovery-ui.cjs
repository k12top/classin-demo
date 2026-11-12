// Actual feed/detail/overlay hooks over native HTTP. Identity, activity data and
// the realtime-ready flag are fixtures; this is not a real-account acceptance.
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'activity-release-recovery-'));
app.setPath('userData',profile);app.on('window-all-closed',()=>{});
let server,win,released=false,dropList=0,dropDetail=0,firstDrop=0;const drops={list:0,detail:0};
const summary=()=>({id:'activity',title:'Release recovery',kind:'quiz',status:released?'published':'active',version:released?2:1,answerReleaseScope:released?'all':null,questionCount:1,responseCount:0,presented:true,presentedQuestion:0,durationSec:null,startedAt:'2026-11-12T05:00:00Z',deadlineAt:null,createdAt:'2026-11-12T05:00:00Z',updatedAt:'2026-11-12T05:00:00Z'});
const detail=()=>({...summary(),resultsVisible:released,definition:{questions:[{id:'q',type:'single',prompt:'Release recovery',points:10,options:[{id:'a',text:'One'},{id:'b',text:'Two'}],...(released?{correct:['b']}: {})}]},ownResponse:null,responses:[],responseCursor:null,statistics:null});
async function main(){
 await app.whenReady();
 const source=`import React,{useEffect}from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{ClassroomSyncProvider,useClassroomSyncOwner}from'@/lib/classroom/use-classroom-sync';import{useChatActivities}from'@/lib/classroom/use-chat-activities';import{ActivityChatCard}from'@/components/classroom/activity-chat-card';import{StudentActivityOverlay}from'@/components/classroom/student-activity-overlay';const noop=()=>{};function Feed(){const feed=useChatActivities('lesson',null,true);return <><p data-feed-error>{feed.error?'failed':'ready'}</p>{feed.activities.map(a=><ActivityChatCard key={a.id} activity={a} sessionId="lesson" student onChanged={noop} onManage={noop}/>)}</>}function Fixture(){const sync=useClassroomSyncOwner('lesson',true);useEffect(()=>sync.scheduler.setRealtime(true),[sync]);return <ClassroomSyncProvider value={sync}><Feed/><StudentActivityOverlay sessionId="lesson" currentUserId="student" onChanged={noop}/></ClassroomSyncProvider>}createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="en"><Fixture/></I18nProvider>);`;
 const bundle=await esbuild.build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'app.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:path.join(root,'tsconfig.json')});
 const assets=new Map(bundle.outputFiles.map(f=>['/'+path.basename(f.path),f.contents]));
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(assets.has(url.pathname)){res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':'text/javascript');return res.end(assets.get(url.pathname));}
  if(url.pathname.startsWith('/api/')){
   res.setHeader('content-type','application/json');
   if(url.searchParams.has('versionOnly'))return res.end(JSON.stringify({revision:released?2:1}));
   const isDetail=url.pathname.endsWith('/activity');
   if(released&&(isDetail?dropDetail:dropList)>0){if(isDetail)drops.detail++;else drops.list++;firstDrop||=Date.now();return res.destroy();}
   return res.end(JSON.stringify(isDetail?detail():{activities:[summary()],active:released?null:summary(),nextCursor:null,canManage:false,canAnswer:true,canPrepare:false,live:true}));
  }
  res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{backgroundThrottling:false}});const run=code=>win.webContents.executeJavaScript(code);
 const wait=async(code,budget=6500)=>{const until=Date.now()+budget;do{if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,40));}while(Date.now()<until);throw Error('Timed out: '+code+'\n'+await run('document.body.innerText'));};
 await win.loadURL(`http://127.0.0.1:${server.address().port}`);
 await wait(`document.querySelector('[data-activity-card]')?.textContent.includes('Not submitted')&&document.querySelector('[data-student-activity] input[type=radio]')`);
 assert.equal(await run(`document.querySelectorAll('[data-choice-result]').length`),0);
 released=true;dropList=1;dropDetail=1;
 await wait(`document.querySelector('[data-feed-error]')?.textContent==='failed'`);
 assert.equal(await run(`document.querySelectorAll('[data-choice-result]').length`),0,'a failed read retains the unreleased view');
 // Keep the outage active until both application reads have actually failed;
 // Chromium can retry a disconnected idempotent GET below the fetch layer.
 for(let i=0;i<100&&(!drops.list||!drops.detail);i++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.ok(drops.list>0&&drops.detail>0);dropList=0;dropDetail=0;
 await wait(`document.querySelector('[data-feed-error]')?.textContent==='ready'&&document.querySelector('[data-choice-result]')&&document.querySelector('[data-student-activity] input[type=radio]')?.disabled`);
 const recoveryMs=Date.now()-firstDrop;assert.ok(recoveryMs<5500,`automatic retry took ${recoveryMs}ms`);
 assert.equal(await run(`Array.from(document.querySelectorAll('[data-activity-card] [aria-label]')).some(e=>e.getAttribute('aria-label').includes('Correct answer'))`),true);
 const output=path.join(root,'outputs/classroom-live-network');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'automatic-recovery.json'),JSON.stringify({passed:true,recoveryMs,checks:['native HTTP list and detail socket failures','unreleased data retained on failure','automatic recovery without focus or manual retry','unanswered student sees all-released key','stale answer controls disabled'],boundary:'Actual hooks, chat card and student overlay; HTTP data and realtime-ready flag are fixtures.'},null,2));
 console.log(`PASS actual activity feed/detail/overlay automatically recover a released answer in ${recoveryMs}ms after native socket failures`);
}
function cleanup(){win?.destroy();server?.close();fs.rmSync(profile,{recursive:true,force:true});}
main().then(()=>{cleanup();app.exit(0)},error=>{console.error(error);cleanup();app.exit(1)});
