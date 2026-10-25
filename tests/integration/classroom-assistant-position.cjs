/* eslint-disable @typescript-eslint/no-require-imports -- Browser acceptance with actual pointer events and simulated AI responses. */
// Run: clients/desktop/node_modules/.bin/electron tests/integration/classroom-assistant-position.cjs
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),cache=path.join(root,'node_modules/.cache/assistant-layout'),output=path.join(root,'outputs/classroom-assistant-drag-2026-10-17');
let win,server;
async function main(){
 await fs.mkdir(cache,{recursive:true});await fs.mkdir(output,{recursive:true});
 const bundle=await esbuild.build({stdin:{resolveDir:root,loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{TeacherAssistant}from'@/components/classroom/teacher-assistant';import{I18nProvider}from'@/lib/i18n/context';createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><main className="classroom-v3-shell is-classin-layout fixture"><div className="fixture-header">课堂 · AI 问答布局验证</div><section className="classroom-v3-stage" data-board-tools-visible="false"><TeacherAssistant sessionId="lesson" teacher={{name:'nkwill',avatar:''}} shareAccess=""/></section><footer>课堂控制区</footer></main></I18nProvider>);`},bundle:true,write:false,outfile:path.join(cache,'fixture.js'),platform:'browser',format:'iife',define:{'process.env':'{}'},tsconfig:path.join(root,'tsconfig.json')});
 const scripts=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,modules=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const {execFileSync}=require('node:child_process');const cssFile=path.join(cache,'global.css');execFileSync('node',[require.resolve('tailwindcss/lib/cli.js'),'-i',path.join(root,'src/app/globals.css'),'-o',cssFile,'--minify'],{cwd:root,stdio:'pipe'});
 const styles=await fs.readFile(cssFile,'utf8')+'\n'+(await Promise.all(['classroom-classin.css','classroom-light.css'].map(name=>fs.readFile(path.join(root,'src/app',name),'utf8')))).join('\n');
 server=http.createServer(async(req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','application/javascript');return res.end(scripts)}
  if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end(styles+'\n'+modules)}
  if(req.url.includes('/classroom/assistant')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({sessionId:'lesson',answer:Array.from({length:32},(_,i)=>'第'+(i+1)+'点：先整理课堂中的已知条件，再通过一个例子理解解题方法。').join('\n')}))}
  res.end(`<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui}button,textarea{font-family:inherit}#root{height:100dvh}.fixture{display:grid!important;grid-template-rows:100px minmax(0,1fr) 64px!important;height:100dvh!important;min-height:0!important;padding:0!important;gap:0!important}.fixture::before{display:none}.fixture-header,footer{padding:20px;color:var(--classroom-frost);background:var(--classroom-graphite)}.fixture .classroom-v3-stage{margin:8px 12px!important;min-height:0!important;min-width:0!important;position:relative;display:block!important;border-radius:12px;overflow:hidden;background:var(--classroom-graphite)}@media(max-width:1024px){.fixture{grid-template-rows:48px minmax(0,1fr) 64px!important}.fixture-header,footer{padding:12px}}</style><div id="root"></div><script src="/fixture.js"></script></html>`)
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await app.whenReady();win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{backgroundThrottling:false,partition:'assistant-position-'+Date.now()}});const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
 await win.loadURL('http://127.0.0.1:'+server.address().port+'/?lang=zh-CN');const run=async code=>{try{return await win.webContents.executeJavaScript(code)}catch(error){throw new Error(String(error)+'; code: '+code+'; renderer: '+errors.join('; '))}};
 const wait=async code=>{const end=Date.now()+10000;while(!await run(code)){if(Date.now()>end)throw Error('timeout '+code);await new Promise(resolve=>setTimeout(resolve,30))}};
 win.webContents.debugger.attach('1.3');
 const dispatch=(method,params)=>win.webContents.debugger.sendCommand(method,params);
 const pause=()=>new Promise(resolve=>setTimeout(resolve,35));
 const rect=selector=>run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error(document.body.innerHTML.slice(0,2200));const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom,right:r.right}})()`);
 const dock='section[aria-label="AI 问答"] > div:last-child';
 const widget='section[aria-label="AI 问答"]';
 const identity=dock+' button[data-assistant-move]';
 const header=widget+' header h2';
 const grip=widget+' header button[data-assistant-move]';
 const dragTo=async(selector,dx,dy,touch=false,releaseOutside=false)=>{
  const p=await rect(selector);
  if(touch){await dispatch('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]})}
  else {await dispatch('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,buttons:0});await pause();await dispatch('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',buttons:1,clickCount:1})}
  for(let step=1;step<=8;step++){
   const x=p.x+dx*step/8,y=p.y+dy*step/8;
   await dispatch(touch?'Input.dispatchTouchEvent':'Input.dispatchMouseEvent',touch?{type:'touchMove',touchPoints:[{x,y,id:1}]}:{type:'mouseMoved',x,y,buttons:1});await pause();
  }
  if(touch)await dispatch('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  else await dispatch('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+dx+(releaseOutside?2000:0),y:p.y+dy+(releaseOutside?2000:0),button:'left',buttons:0,clickCount:1});
  await pause();
 };
 const click=selector=>dragTo(selector,0,0);
 const key=async(key,modifiers=0)=>{await dispatch('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers});await dispatch('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers});await pause()};
 const isOpen=()=>run(`!!document.querySelector('[role="log"]')`);
 const checkFits=async()=>{
  const geometry=await run(`(()=>{const e=document.querySelector(${JSON.stringify(widget)}),b=e.parentElement.getBoundingClientRect(),r=e.getBoundingClientRect(),form=e.querySelector('form')?.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,bounds:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},formBottom:form?.bottom,viewport:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth}})()`);
  assert.ok(geometry.left>=geometry.bounds.left-1&&geometry.right<=geometry.bounds.right+1,JSON.stringify(geometry));
  assert.ok(geometry.top>=geometry.bounds.top-1&&geometry.bottom<=geometry.bounds.bottom+1,JSON.stringify(geometry));
  assert.ok(geometry.top>=0&&geometry.bottom<=geometry.viewport[1],JSON.stringify(geometry));
  assert.ok(geometry.scrollWidth<=geometry.viewport[0]);
  if(geometry.formBottom)assert.ok(geometry.formBottom<=geometry.bottom);
  return geometry;
 };
 const screenshot=async name=>fs.writeFile(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());
 await wait(`document.querySelector('button[aria-expanded]')`);
 await dragTo(identity,2,1);await wait(`document.querySelector('[role="log"]')`);
 const defaultTop=(await rect(widget)).top;
 const first=await rect(widget);await dragTo(header,300,110);let moved=await rect(widget);
 assert.ok(Math.abs(moved.left-first.left-300)<2);assert.ok(Math.abs(moved.top-first.top-110)<2);await checkFits();
 await screenshot('desktop-dragged');
 await dragTo(header,880,600,false,true);const rightEdge=await checkFits();assert.ok(Math.abs(rightEdge.right-rightEdge.bounds.right)<2);assert.equal(await isOpen(),true);
 await dragTo(header,-1180,-500);const leftEdge=await checkFits();assert.ok(Math.abs(leftEdge.left-leftEdge.bounds.left)<2&&Math.abs(leftEdge.top-leftEdge.bounds.top)<2);assert.equal(await isOpen(),true);
 await dragTo(identity,200,50);assert.equal(await isOpen(),true,'dragging the dock must not collapse the panel');
 await click(widget+' header button[aria-label="收起问答"]');await wait(`!document.querySelector('[role="log"]')`);
 const collapsed=await rect(widget);await dragTo(identity,100,100);moved=await rect(widget);
 assert.ok(Math.abs(moved.left-collapsed.left-100)<2&&Math.abs(moved.top-collapsed.top-100)<2);assert.equal(await isOpen(),false,'dragging a collapsed dock must not open it');
 await click(dock+' button[aria-label="缩小老师栏"]');assert.ok((await rect(widget)).width<70);
 await dragTo(identity,200,60);assert.equal(await isOpen(),false);await checkFits();
 await click(identity);await wait(`document.querySelector('[role="log"]')`);await checkFits();
 await run(`document.querySelector(${JSON.stringify(grip)}).focus()`);await key('Home');
 assert.ok(Math.abs((await rect(widget)).top-defaultTop)<2);
 const keyStart=await rect(widget);await key('ArrowRight');await key('ArrowDown',8);moved=await rect(widget);
 assert.ok(Math.abs(moved.left-keyStart.left-10)<2&&Math.abs(moved.top-keyStart.top-40)<2);
 await click('[role="log"] button');await wait(`document.querySelector('[role="log"]').textContent.includes('第32点')`);
 assert.ok(await run(`(()=>{const e=document.querySelector('[role="log"]');return e.scrollHeight>e.clientHeight})()`));
 await dragTo(header,800,80);win.setContentSize(390,844);await wait('innerWidth===390');await pause();await checkFits();
 await dispatch('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 const touchStart=await rect(widget);await dragTo(header,0,100,true);moved=await rect(widget);
 assert.ok(moved.top>touchStart.top+50);assert.equal(await isOpen(),true);await checkFits();
 await run(`document.querySelector('[role="log"]').scrollTop=0`);await dragTo('[role="log"]',0,-100,true);
 assert.ok(await run(`document.querySelector('[role="log"]').scrollTop>10`),'touch scrolling the conversation does not move the panel');
 assert.ok(Math.abs((await rect(widget)).top-moved.top)<2);await screenshot('mobile-touch');
 await click(widget+' header button[aria-label="收起问答"]');await wait(`!document.querySelector('[role="log"]')`);
 await click(dock+' button[aria-label="缩小老师栏"]');const miniStart=await rect(widget);await dragTo(identity,80,-60,true);moved=await rect(widget);
 assert.ok(moved.left>miniStart.left+40);assert.equal(await isOpen(),false);await checkFits();
 await click(identity);await wait(`document.querySelector('[role="log"]')`);await checkFits();
 win.setContentSize(844,390);await wait('innerWidth===844');await pause();await checkFits();
 await dragTo(header,220,100,true);await checkFits();await screenshot('landscape');
 await run(`document.querySelector('.classroom-v3-stage').dataset.boardToolsVisible='true'`);await pause();await checkFits();
 await run(`document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(`!document.querySelector('[role="log"]')`);
 assert.deepEqual(errors,[]);
 console.log('PASS production AI Q&A: native mouse and touch drag, expanded/collapsed/minimized positions, no accidental toggle, bounds/resize, keyboard moves/reset, touch scrolling and visible composer. AI HTTP responses are simulated.');
}
main().then(()=>cleanup(0),error=>{console.error(error);cleanup(1)});function cleanup(code){win?.destroy();server?.close();app.exit(code)}
