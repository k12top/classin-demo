/* eslint-disable @typescript-eslint/no-require-imports -- isolated Electron fixture */
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),esbuild=require('esbuild'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-remote-focus-'));app.setPath('userData',temp);app.on('window-all-closed',()=>{});let server,win;
async function main(){await app.whenReady();
 const mocks={
  '@/lib/classroom/use-remote-control':`export function useRemoteControl(){return {grants:[{id:'grant',studentId:'student',teacherId:'teacher',shareClaimId:'share',effectiveState:'granted',receiverReady:true,keyReady:false}],loaded:true,error:false,command:async()=>{}}}`,
  '@/lib/classroom/remote-control-handshake':`export async function prepareRemoteControlSender(){return {signer:{close(){}},targetSignalingId:'target'}}`,
  '@/lib/classroom/remote-control-transport':`export function createRemoteControlTransport(){return {enqueue:()=>true,close(){}}}`,
 };
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import{TeacherRemoteControl}from'@/components/classroom/teacher-remote-control';window.fetch=async(_url,options)=>{window.fixtureStops.push(JSON.parse(options.body));return {ok:true}};window.fixtureStops=[];createRoot(document.getElementById('root')).render(<div><div className="classroom-v3-media-video"><video id="shared" /></div><button id="outside">outside</button><TeacherRemoteControl sessionId="session" clientId="device" teacherId="teacher" studentId="student" claimId="share" locale="en" publishHint={async()=>{}} publishInput={async()=>{}}/></div>);`;
 const bundle=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'mocks',setup(build){build.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);build.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
 server=http.createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles[0].contents);}res.end('<div id="root"></div><script src="/app.js"></script>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});await win.loadURL(`http://127.0.0.1:${server.address().port}`);const run=code=>win.webContents.executeJavaScript(code);const wait=async expr=>{for(let i=0;i<80;i++){if(await run(expr))return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error(`Timed out: ${expr}`);};
 await wait(`document.body.textContent.includes('Waiting for the shared screen')`);
 assert.equal(await run(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Start control'&&!b.disabled)`),false);
 await run(`Object.defineProperty(document.querySelector('#shared'),'videoWidth',{value:1920});Object.defineProperty(document.querySelector('#shared'),'videoHeight',{value:1080})`);
 await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Start control'&&!b.disabled)`);
 await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Start control').click()`);await wait(`!!document.querySelector('[role="application"]')`);
 await run(`window.dispatchEvent(new Event('blur'))`);await wait(`document.body.textContent.includes('screen lost focus')`);
 assert.equal(await run(`window.fixtureStops.filter(x=>x.action==='stop'&&x.grantId==='grant').length`),1);assert.equal(await run(`!!document.querySelector('[role="application"]')`),false);
 console.log('PASS video readiness gates control and focus loss revokes the grant');
}
main().then(()=>{win?.destroy();server?.close();fs.rmSync(temp,{recursive:true,force:true});app.exit(0);},error=>{console.error(error);win?.destroy();server?.close();fs.rmSync(temp,{recursive:true,force:true});app.exit(1);});
