// Actual page components; isolated read-only synthetic HTTP fixtures.
const {app,BrowserWindow}=require('electron');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'design-review-ui-'));
app.setPath('userData',temp);app.on('window-all-closed',()=>{});
setTimeout(()=>{console.error('Design review timed out');void finish(1);},90000).unref();
let child,win;
async function main(){
 await app.whenReady();
 child=spawn(process.execPath,[path.join(root,'scripts/preview-workspace-design.cjs')],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',DESIGN_PORT:'3191'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error('Preview startup timed out: '+log)),30000);child.stdout.on('data',chunk=>{log+=chunk;if(log.includes('Read-only component preview')){clearTimeout(timer);resolve();}});child.stderr.on('data',chunk=>log+=chunk);child.once('exit',code=>{clearTimeout(timer);reject(Error('Preview exited '+code+': '+log));});});
 win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}});
 const run=code=>win.webContents.executeJavaScript(code);
 const wait=async code=>{for(let i=0;i<120;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+code+' | '+await run('document.body.innerText.slice(0,1800)')); };
 const click=text=>run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
 const output=path.join(root,'outputs/workspace-design-review');fs.mkdirSync(output,{recursive:true});
 const checks=[];
 for(const [locale,label]of [['zh-CN','发言时间线'],['zh-TW','發言時間軸'],['en','Utterance timeline'],['vi','Dòng thời gian phát biểu']]){
  for(const width of [1280,390]){
   win.setContentSize(width,900);await win.loadURL(`http://127.0.0.1:3191/courses/math/playback?lang=${locale}`);await wait(`Array.from(document.querySelectorAll('h2')).some(h=>h.textContent===${JSON.stringify(label)})`);
   assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,locale+' overflow '+width);
   assert.equal(await run(`Array.from(document.querySelectorAll('h2')).find(h=>h.textContent===${JSON.stringify(label)}).getBoundingClientRect().height<30`),true,'compact section heading');
   checks.push(locale+' '+width+' localized replay without overflow');
  }
 }
 win.setContentSize(1280,900);await win.loadURL('http://127.0.0.1:3191/courses/math/playback?lang=en&video=1');
 await wait(`Boolean(document.querySelector('[data-playback-settings]'))`);
 // This layout fixture intentionally has no media bytes; dismiss its expected help dialog.
 await wait(`Boolean(document.querySelector('video').error)`);await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Dismiss')`);await click('Dismiss');
 await wait(`!document.querySelector('[role=dialog]')`);await run(`document.activeElement?.blur()`);
 const toolbarOpacity=`getComputedStyle(document.querySelector('[class*=playerToolbar]')).opacity`;
 win.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});await wait(toolbarOpacity+`==='0'`);
 const videoBox=await run(`(()=>{const r=document.querySelector('video').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
 win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(videoBox.x+videoBox.width/2),y:Math.round(videoBox.y+videoBox.height/2)});await wait(toolbarOpacity+`==='1'`);
 assert.equal(await run(`(()=>{const v=document.querySelector('video').getBoundingClientRect(),t=document.querySelector('[class*=playerToolbar]').getBoundingClientRect();return t.top>=v.top&&Math.abs(t.bottom-v.bottom)<1;})()`),true,'hover tools attach to the video bottom');
 win.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});await wait(toolbarOpacity+`==='0'`);checks.push('video tools reveal on hover and hide after leaving');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
 await run(`document.querySelector('[data-playback-settings]').focus()`);await wait(toolbarOpacity+`==='1'`);checks.push('keyboard focus reveals video tools');
 assert.equal(await run(`document.querySelector('video').controls`),false,'one custom control strip');checks.push('single control strip attached to video bottom');
 await run(`document.querySelector('button[aria-label="Mute"]').click()`);await wait(`document.querySelector('video').muted&&Boolean(document.querySelector('button[aria-label="Unmute"]'))`);
 await run(`document.querySelector('button[aria-label="Unmute"]').click()`);await wait(`!document.querySelector('video').muted`);checks.push('mute control follows native media state');
 assert.equal(await run(`document.querySelector('[class*=playerToolbar] select')===null`),true,'speed and quality are not permanent toolbar controls');
 const choose=label=>run(`(()=>{const item=Array.from(document.querySelectorAll('[role^=menuitem]')).find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!item)throw Error('Missing menu item '+${JSON.stringify(label)});item.click();})()`);
 const settings=async()=>{await run(`document.querySelector('[data-playback-settings]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await wait(`Boolean(document.querySelector('[role=menu]'))`);};
 await settings();await choose('Playback speed1×');await wait(`Boolean(document.querySelector('[role=menuitemradio]'))`);
 assert.equal(await run(`Array.from(document.querySelectorAll('[role=menuitemradio]')).find(e=>e.textContent==='1×').getAttribute('data-state')`),'checked');
 await choose('1.5×');await wait(`document.querySelector('video').playbackRate===1.5&&!document.querySelector('[role=menu]')`);checks.push('settings speed selection updates actual media rate');
 await settings();await wait(`document.querySelector('[role=menu]').textContent.includes('1.5×')`);
 await run(`document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await wait(`!document.querySelector('[role=menu]')&&document.activeElement===document.querySelector('[data-playback-settings]')`);checks.push('settings Escape closes and restores focus');
 await settings();await run(`document.querySelector('h1').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0}))`);await wait(`!document.querySelector('[role=menu]')`);checks.push('settings outside pointer closes the menu');
 await settings();await choose('Caption settings');await wait(`Boolean(document.querySelector('[role=dialog] #playback-caption-settings'))`);
 assert.equal(await run(`document.querySelector('[role=dialog]').closest('[data-replay-stage]')!==null`),true,'caption settings stay inside fullscreen stage');
 await run(`document.querySelector('[role=dialog] button[aria-label="Close"]').click()`);await wait(`!document.querySelector('[role=dialog]')`);checks.push('caption settings use a dialog inside the video stage');
 win.show();win.focus();
 await win.webContents.executeJavaScript(`void document.querySelector('[data-replay-stage]').requestFullscreen().catch(error=>console.error(error));`,true);
 await wait(`Boolean(document.fullscreenElement)`);
 await new Promise(resolve=>setTimeout(resolve,1200));win.focus();
 await settings();assert.equal(await run(`document.fullscreenElement?.contains(document.querySelector('[role=menu]'))`),true,'settings portal belongs to fullscreen stage');
 assert.equal(await run(`(()=>{const r=document.querySelector('[role=menu]').getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()`),true,'fullscreen menu remains in viewport');
 await run(`document.querySelector('[role=menu]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);// A disposable window avoids waiting on macOS native fullscreen exit animations.
 win.destroy();win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{backgroundThrottling:false}});checks.push('fullscreen settings stay visible inside the fullscreen stage');



 win.setContentSize(1280,900);await win.loadURL('http://127.0.0.1:3191/courses/math/playback?lang=en&empty=1');
 await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Generate lesson summary')`);
 assert.equal(await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Generate lesson summary').disabled`),true,'no captions cannot generate');checks.push('no-caption generation disabled');
 await win.loadURL('http://127.0.0.1:3191/courses/math/playback?lang=en&role=student');await wait(`document.body.innerText.includes('Compiled from classroom speech.')`);
 assert.equal(await run(`Array.from(document.querySelectorAll('button')).some(b=>/^(Regenerate|Edit|Publish to students)$/.test(b.textContent.trim()))`),false,'student summary has no teacher action');
 assert.equal(await run(`document.body.innerText.includes('try again when ready')`),false,'student copy does not invite regeneration');checks.push('student summary uses read-only guidance');
 fs.writeFileSync(path.join(output,'student-replay.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({passed:true,checks,boundary:'Actual React pages and CSS; identity and read-only API data are synthetic. Separate authenticated Pen imports are documented in docs/design/classroom-workspace.md.'},null,2));console.log('PASS '+checks.length+' workspace design review checks');
}
async function finish(code){win?.destroy();child?.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true});app.exit(code);}
main().then(()=>finish(0),error=>{console.error(error);finish(1);});
