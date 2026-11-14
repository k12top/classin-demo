// Actual dashboard/subpage and HTTP reader; identity, shell and course data are fixtures.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),esbuild=require('esbuild'),http=require('node:http');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-course-recovery-'));
app.setPath('userData',temp);app.on('window-all-closed',()=>{});
let server,win,mode='ready',name='Initial class',requests=0,active=0,peak=0;
const held=[],checks=[];
async function main(){
 await app.whenReady();
 const shell=`import React from'react';export function WorkspaceApp({courses,error,offline,refreshing,refresh,navigation,children}){return <main><output data-error={String(Boolean(error))} data-offline={String(Boolean(offline))} data-loading={String(Boolean(refreshing))}>{courses.map(c=>c.name).join(',')}</output><aside>{navigation}</aside><button onClick={refresh}>Refresh</button>{children}</main>}`;
 const mocks={
  '@/lib/auth-context':`export const useAuth=()=>({user:window.fixtureUser,loading:false});`,
  '@/lib/i18n/context':`const t=key=>key;export const useTranslation=()=>({t});`,
  '@/lib/auth-refresh-client':`export const tryOAuthRefresh=async()=>false;`,
  '@/lib/auth-login':`export const redirectToSsoLogin=()=>{window.redirected=true};`,
  '@/components/ui/page-loading-state':`import React from'react';export const PageLoadingState=()=> <p>Loading</p>;`,
  '@/components/workspace/workspace-app':shell,'./workspace-app':shell,
 };
 const source=`import React from'react';import{createRoot}from'react-dom/client';import DashboardPage from'@/app/page';import{WorkspaceSubpage}from'@/components/workspace/workspace-subpage';const root=createRoot(document.getElementById('root'));window.fixtureOnline=true;window.fixtureVisibility='visible';Object.defineProperty(navigator,'onLine',{get:()=>window.fixtureOnline});Object.defineProperty(document,'visibilityState',{get:()=>window.fixtureVisibility});window.fixtureRender=(surface,id='alice')=>{window.fixtureUser={userId:id};root.render(<React.StrictMode>{surface==='home'?<DashboardPage/>:surface==='detail'?<WorkspaceSubpage user={window.fixtureUser} navigation={courses=>courses.map(c=>c.name).join(',')}><p>Course detail</p></WorkspaceSubpage>:null}</React.StrictMode>)};`;
 const bundle=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':JSON.stringify(process.argv.includes('--production')?'production':'development'),'process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture',setup(build){build.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'mock'}:undefined);build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:root}));}}]});
 server=http.createServer((req,res)=>{
  if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles[0].contents);}
  if(req.url==='/api/courses'){
   requests++;active++;peak=Math.max(peak,active);res.once('close',()=>active--);
   const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
   if(mode==='unavailable')return reply(503,{error:'Temporary failure'});
   if(mode==='denied')return reply(403,{error:'Permission removed'});
   if(mode==='expired')return reply(401,{error:'Session expired'});
   if(mode==='malformed')return reply(200,{unexpected:true});
   const data={courses:[{id:'course',name}]};
   if(mode==='held'){held.push(()=>reply(200,data));return;}
   return reply(200,data);
  }
  res.setHeader('content-type','text/html');res.end('<div id="root"></div><script src="/app.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
 const run=code=>win.webContents.executeJavaScript(code),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(predicate,label,timeout=3500)=>{const end=Date.now()+timeout;do{if(await predicate())return;await pause(25);}while(Date.now()<end);throw Error('Timed out: '+label);};
 const dom=(expression,label=expression)=>wait(()=>run(expression),label);
 const click=()=>run(`document.querySelector('button').click()`);
 for(const surface of ['home','detail']){
  await win.loadURL(`http://127.0.0.1:${server.address().port}`);mode='unavailable';peak=0;
  await run(`fixtureRender('${surface}')`);await dom(`document.querySelector('output')?.dataset.error==='true'`);
  const initial=requests;name='Recovered initial';mode='ready';
  await dom(`document.querySelector('output')?.textContent==='Recovered initial'&&document.querySelector('output').dataset.error==='false'`,'initial 503 automatically recovers before 60 second poll');
  assert.equal(requests,initial+1);checks.push(surface+': initial failure auto-recovery');

  mode='unavailable';await click();await dom(`document.querySelector('output')?.dataset.error==='true'`);
  assert.equal(await run(`document.querySelector('output').textContent`),'Recovered initial');
  name='Recovered refresh';mode='ready';await dom(`document.querySelector('output')?.textContent==='Recovered refresh'&&document.querySelector('output').dataset.error==='false'`);
  checks.push(surface+': manual failure retains courses and auto-recovers');

  mode='held';const before=requests;await click();await wait(()=>held.length===1,'read held');
  await run(`for(let i=0;i<12;i++){document.querySelector('button').click();window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('classroom:workspace-lesson-changed'));}`);
  await pause(250);assert.equal(requests,before+1,'refresh bursts do not overlap a pending read');assert.equal(peak,1);
  mode='ready';held.shift()();await wait(()=>requests===before+2,'one coalesced follow-up');await pause(150);assert.equal(requests,before+2);
  checks.push(surface+': burst coalescing');

  mode='denied';await click();await dom(`document.querySelector('output')?.dataset.error==='true'&&document.querySelector('output').textContent===''`);
  assert.equal(await run(`document.querySelector('aside').textContent`),'');
  const deniedReads=requests;await pause(2200);assert.equal(requests,deniedReads,'403 must not enter fast retry loop');
  mode='ready';await click();await dom(`document.querySelector('output')?.dataset.error==='false'`);checks.push(surface+': permission denial clears data without quick retries');

  mode='malformed';await click();await dom(`document.querySelector('output')?.dataset.error==='true'`);mode='ready';await dom(`document.querySelector('output')?.dataset.error==='false'`);checks.push(surface+': invalid response recovery');

  mode='unavailable';await click();await dom(`document.querySelector('output')?.dataset.error==='true'`);
  await run(`window.fixtureOnline=false;window.dispatchEvent(new Event('offline'));`);const offlineReads=requests;
  await pause(2250);assert.equal(requests,offlineReads);mode='ready';name='Reconnected';
  await run(`window.fixtureOnline=true;window.dispatchEvent(new Event('online'));`);await dom(`document.querySelector('output')?.textContent==='Reconnected'`);
  await run(`window.fixtureVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'));document.querySelector('button').click();`);
  const hiddenReads=requests;await pause(150);assert.equal(requests,hiddenReads);
  await run(`window.fixtureVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));`);await wait(()=>requests===hiddenReads+1,'visible resumes');checks.push(surface+': offline and hidden suspension');

  mode='held';await click();await wait(()=>held.length===1,'old account read held');
  mode='ready';name='Only Bob';await run(`fixtureRender('${surface}','bob')`);await dom(`document.querySelector('output')?.textContent==='Only Bob'`);
  held.shift()();await pause(100);assert.equal(await run(`document.querySelector('output').textContent`),'Only Bob');checks.push(surface+': late previous-account response ignored');

  mode='expired';await click();await dom(`window.redirected===true&&!document.querySelector('output')`,'401 clears shell and redirects');
  const stoppedReads=requests;await pause(2150);assert.equal(requests,stoppedReads);checks.push(surface+': expired session stops reads');
 }
 await win.loadURL(`http://127.0.0.1:${server.address().port}`);
 await run(`window.desktopReads=0;window.desktopCached=true;window.classroomDesktop={getCachedCourses:async()=>{window.desktopReads++;return {ok:true,cached:window.desktopCached,data:{courses:[{id:'cached',name:window.desktopCached?'Saved class':'Online class'}]}}}};fixtureRender('home');`);
 await dom(`document.querySelector('output')?.dataset.offline==='true'`);await run(`window.desktopCached=false`);
 await dom(`document.querySelector('output')?.textContent==='Online class'&&document.querySelector('output').dataset.offline==='false'`,'desktop cached result continues recovery');
 assert.equal(await run('window.desktopReads'),2);checks.push('desktop: cached courses are labeled and revalidated automatically');
 await run(`window.fixtureOnline=false;window.dispatchEvent(new Event('offline'));fixtureRender('none');`);await pause(100);
 await run(`window.desktopCached=true;fixtureRender('home');`);await dom(`document.querySelector('output')?.textContent==='Saved class'`,'initial offline mount may read local cache');
 const cacheReads=await run('window.desktopReads');await pause(2150);assert.equal(await run('window.desktopReads'),cacheReads);
 await run(`fixtureRender('none');`);await dom(`!document.querySelector('output')`);
 await run(`window.fixtureOnline=true;window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));`);await pause(150);assert.equal(await run('window.desktopReads'),cacheReads);checks.push('desktop: offline initialization and unmount cleanup');
 const output=path.join(root,'outputs/workspace-course-recovery');fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,process.argv.includes('--production')?'production-checks.json':'checks.json'),JSON.stringify({passed:true,checks,boundary:'Actual dashboard, subpage, reader and HTTP failures. Identity, course data, shell display and desktop IPC results are fixtures; no hardware, production writes or cloud media.'},null,2));
 console.log('PASS '+checks.join('; '));
}
async function finish(code){win?.destroy();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}fs.rmSync(temp,{recursive:true,force:true});setImmediate(()=>code?app.exit(code):app.quit());}
main().then(()=>finish(0),error=>{console.error(error);return finish(1);});
