/* eslint-disable @typescript-eslint/no-require-imports -- Native ESM chunk loading and actual TrophyModel lifecycle in isolated Chromium. */
const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
if(!process.versions.electron){
 const r=spawnSync(require(path.join(root,'clients/desktop/node_modules/electron')),[__filename],{cwd:root,stdio:'inherit',env:{...process.env,NODE_PATH:path.join(root,'clients/desktop/node_modules')},timeout:90000});
 if(r.error)throw r.error;process.exitCode=r.status??1;
}else{
 const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild');
 let win,server;
 async function main(){
  const output=path.join(root,'outputs/classroom-lazy-award-2026-10-31');await fs.mkdir(output,{recursive:true});
  const bundle=await esbuild.build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{TrophyModel}from'./src/components/classroom/trophy-model';
    window.gpuStarts=0;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='webgl')window.gpuStarts++;return original.call(this,kind,...args)};
    window.previousCanvas=null;window.wasDisposed=false;
    function App(){const[show,setShow]=useState(false);window.showAward=()=>setShow(true);window.hideAward=()=>{window.previousCanvas=document.querySelector('canvas');setShow(false)};return <div><button>Classroom controls remain usable</button>{show&&<div style={{width:210,height:210}}><TrophyModel reducedMotion={false}/></div>}</div>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,splitting:true,format:'esm',platform:'browser',minify:true,write:false,metafile:true,outdir:path.join(output,'bundle'),entryNames:'loader',tsconfig:path.join(root,'tsconfig.json')});
  const files=new Map(bundle.outputFiles.map(f=>['/'+path.basename(f.path),f.contents]));
  const rendererOutput=Object.entries(bundle.metafile.outputs).find(([,v])=>v.entryPoint?.endsWith('/trophy-renderer.ts'));
  assert(rendererOutput,'Renderer has its own chunk');const rendererPath='/'+path.basename(rendererOutput[0]);
  const entry=Object.values(bundle.metafile.outputs).find(v=>v.entryPoint==='<stdin>');
  assert(!Object.keys(entry.inputs).some(f=>f.endsWith('/trophy-renderer.ts')),'Renderer excluded from entry');
  let rendererRequests=0,mode='hold',release;
  server=http.createServer((req,res)=>{
   res.setHeader('Cache-Control','no-store');
   if(req.url===rendererPath){rendererRequests++;if(mode==='fail'){res.statusCode=503;return res.end('simulated chunk failure')};const send=()=>{res.setHeader('content-type','text/javascript');res.end(files.get(rendererPath))};if(mode==='hold'){release=send;return}send();return}
   if(files.has(req.url)){res.setHeader('content-type','text/javascript');return res.end(files.get(req.url))}
   res.end('<html><div id="root"></div><script type="module" src="/loader.js"></script></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false,partition:'award-loader-'+Date.now()}});
  const run=code=>win.webContents.executeJavaScript(code);
  const wait=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,50))}throw new Error('Timed out: '+code)};
  const url='http://127.0.0.1:'+server.address().port;
  await win.loadURL(url);await wait('typeof showAward==="function"');
  assert.equal(rendererRequests,0);assert.equal(await run('gpuStarts'),0);
  await run('showAward()');await wait('document.querySelector("canvas[data-renderer=loading]")');
  for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setTimeout(resolve,20));assert(release);
  assert.equal(rendererRequests,1);assert.equal(await run('gpuStarts'),0);
  assert.equal(await run('getComputedStyle(document.querySelector("[data-renderer=fallback]")).display'),'block');
  await run('hideAward()');await wait('!document.querySelector("canvas")');mode='ready';release();
  await new Promise(resolve=>setTimeout(resolve,250));assert.equal(await run('gpuStarts'),0,'Late chunk cannot start a detached renderer');
  await run('showAward()');await wait('document.querySelector("canvas[data-renderer=webgl]")');
  assert.equal(rendererRequests,1,'Successful chunk reused');assert.equal(await run('gpuStarts'),1);
  await run('window.previousContext=document.querySelector("canvas").getContext("webgl");hideAward()');
  await wait('!document.querySelector("canvas") && previousContext.isContextLost()');
  mode='fail';await win.loadURL(url);await wait('typeof showAward==="function"');
  const beforeFailure=rendererRequests;await run('showAward()');await wait('document.querySelector("canvas[data-renderer=unavailable]")');
  assert.equal(rendererRequests,beforeFailure+1);assert.equal(await run('gpuStarts'),0);
  assert.equal(await run('getComputedStyle(document.querySelector("[data-renderer=fallback]")).display'),'block');
  assert.equal(await run('document.querySelector("button").disabled'),false);
  await fs.writeFile(path.join(output,'loading-checks.json'),JSON.stringify({passed:true,checks:['renderer excluded from entry','no renderer request/GPU at startup','fallback while chunk pending','late resolution after unmount starts no GPU','successful module reused','GPU released after unmount','failed chunk keeps fallback and surrounding controls'],boundary:'Real TrophyModel and real ESM chunk HTTP requests in Chromium; isolated local server controls renderer delay/failure.'},null,2));
  console.log('PASS trophy lazy loading: no startup request, delayed/cancelled load, cache reuse, GPU disposal, failed chunk fallback');
 }
 const cleanup=()=>{win?.destroy();server?.close()};
 app.whenReady().then(main).then(()=>{cleanup();app.quit()}).catch(e=>{console.error(e);cleanup();app.exit(1)});
}
