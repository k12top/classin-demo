/* eslint-disable @typescript-eslint/no-require-imports -- isolated Electron fixture */
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),esbuild=require('esbuild'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'offline-courses-ui-'));app.setPath('userData',temp);app.on('window-all-closed',()=>{});let server,win;
async function main(){await app.whenReady();
 const mocks={
  '@/lib/auth-context':`export const useAuth=()=>({user:window.fixtureUser,loading:false});`,
  '@/lib/i18n/context':`export const useTranslation=()=>({t:key=>key});`,
  '@/lib/auth-login':`export const redirectToSsoLogin=()=>{window.redirected=true};`,
  '@/lib/workspace-refresh':`export const watchWorkspaceRefresh=()=>()=>{};`,
  '@/components/ui/page-loading-state':`import React from 'react';export const PageLoadingState=()=> <p>Loading</p>;`,
  '@/components/workspace/workspace-app':`import React from 'react';export const WorkspaceApp=({courses,offline,refresh,error})=><div><output data-offline={String(Boolean(offline))} data-error={String(Boolean(error))}>{courses.map(c=>c.name).join(',')}</output><button onClick={refresh}>Refresh</button></div>;`,
 };
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import DashboardPage from '@/app/page';const root=createRoot(document.getElementById('root'));window.fixtureUser={userId:'alice'};window.fixtureMode='online';window.classroomDesktop={isDesktop:true,getCachedCourses:async id=>window.fixtureMode==='denied'?{ok:false,status:403}:window.fixtureMode==='offline'?{ok:true,cached:true,data:{courses:[{id:'c',name:'Saved '+id}]}}:{ok:true,cached:false,data:{courses:[{id:'c',name:'Online '+id}]}}};window.renderUser=id=>{window.fixtureUser={userId:id};root.render(<DashboardPage/>)};window.renderUser('alice');`;
 const bundle=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,outfile:'app.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'mocks',setup(build){build.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);build.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}}]});
 server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents);}res.end('<div id="root"></div><script src="/app.js"></script>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});await win.loadURL(`http://127.0.0.1:${server.address().port}`);const run=code=>win.webContents.executeJavaScript(code);const wait=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Timed out: '+code);};
 await wait(`document.querySelector('output')?.textContent==='Online alice'`);
 await run(`window.fixtureMode='offline';document.querySelector('button').click()`);await wait(`document.querySelector('output')?.textContent==='Saved alice'`);assert.equal(await run(`document.querySelector('output').dataset.offline`),'true');
 await run(`window.fixtureMode='denied';document.querySelector('button').click()`);await wait(`document.querySelector('output')?.dataset.error==='true'&&document.querySelector('output').textContent===''`);
 await run(`window.fixtureMode='online';window.renderUser('bob')`);await wait(`document.querySelector('output')?.textContent==='Online bob'`);assert.equal(await run(`document.body.textContent.includes('alice')`),false);
 console.log('Desktop course cache is labeled offline, cleared on denial, and scoped to the current account');
}
main().then(()=>{win?.destroy();server?.close();fs.rmSync(temp,{recursive:true,force:true});app.exit(0);},error=>{console.error(error);win?.destroy();server?.close();fs.rmSync(temp,{recursive:true,force:true});app.exit(1);});
