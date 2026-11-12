// Isolated acceptance of the actual workspace and Radix dialogs.
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),esbuild=require('esbuild'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'workspace-keyboard-'));
app.setPath('userData',temp);app.on('window-all-closed',()=>{});let server,win;
async function main(){
 await app.whenReady();
 const mocks={
  'next/navigation':`export const useRouter=()=>({push:path=>{window.fixtureNavigation=path}});`,
  '@/lib/auth-context':`export const useAuth=()=>({logout:()=>{}});`,
  '@/lib/i18n/context':`export const useTranslation=()=>({locale:window.fixtureLocale||'en',t:key=>key});`,
  '@/lib/use-time-zone':`export const useTimeZone=()=>({timeZone:'UTC'});`,
  '@/components/time-zone-selector':`export const TimeZoneSelector=()=>null;export const SchedulingTimeZone=()=>null;export const ScheduleTimePreview=()=>null;`,
  '@/components/LanguageSwitcher':`export default ()=>null;`,
  './use-chat-unread':`export const CHAT_READ_EVENT='fixture-chat-read';export const useChatUnread=()=>({counts:{},previews:{}});`,
  './use-direct-chats':`export const useDirectChats=()=>({chats:[],loading:false,error:false,refresh:async()=>{},remember:()=>{}});`,
  './use-translation-preference':`export const useTranslationPreference=()=>[{enabled:false},()=>{}];`,
  './workspace-home':`import React from'react';export const WorkspaceHome=({onCreate})=><button onClick={onCreate}>Create fixture class</button>;`,
  './workspace-device-check':`export const WorkspaceDeviceCheck=()=>null;`,
 };
 const source=`import React from'react';import{createRoot}from'react-dom/client';import{WorkspaceApp}from'@/components/workspace/workspace-app';const root=createRoot(document.getElementById('root'));let key=0;window.fixtureRender=(locale='en',role='teacher')=>{window.fixtureLocale=locale;root.render(<WorkspaceApp key={++key} courses={[]} user={{userId:'fixture',name:'Fixture',role}} refresh={()=>{}}/>)};window.fixtureRender();`;
 const bundle=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,write:false,outfile:'app.js',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture',setup(build){build.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);build.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));}}]});
 const cssFile=path.join(temp,'globals.css');require('node:child_process').execFileSync('node',[require.resolve('tailwindcss/lib/cli.js'),'-i','src/app/globals.css','-o',cssFile,'--minify'],{cwd:root,stdio:'pipe'});
 const css=fs.readFileSync(cssFile,'utf8')+bundle.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
 const writes=[];server=http.createServer((req,res)=>{
  if(req.method!=='GET')writes.push(req.method+' '+req.url);
  if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents);}
  if(req.url==='/app.css'){res.setHeader('content-type','text/css');return res.end(css);}
  if(req.url.startsWith('/api/')){res.setHeader('content-type','application/json');return res.end(JSON.stringify(req.url.startsWith('/api/groups')?{groups:[]}:{files:[],hasMore:false}));}
  res.setHeader('content-type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 win=new BrowserWindow({show:false,width:1366,height:900,webPreferences:{backgroundThrottling:false}});await win.loadURL(`http://127.0.0.1:${server.address().port}/?view=home`);
 const run=code=>win.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+code);};
 const key=(key,extra='')=>run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true,${extra}}))`);
 const input=(selector,value)=>run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const shortcut=()=>key('k','ctrlKey:true');
 const search=async value=>{await shortcut();await wait(`!!document.querySelector('[role=dialog] input[type=search]')`);await input('[role=dialog] input[type=search]',value);await wait(`!!document.querySelector('[data-search-result]')`);};
 await wait(`!!document.querySelector('[data-workspace-header]')`);
 if(!process.argv.includes('--enter-only')){
  await run(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Create fixture class').click()`);await wait(`!!document.querySelector('[role=dialog] input:not([type=search])')`);
  await input('[role=dialog] input','Keyboard draft');await shortcut();
  assert.equal(await run(`document.querySelector('[role=dialog] input')?.value`),'Keyboard draft','search shortcut must preserve an open class draft');
  await run(`document.querySelector('[role=dialog]>button:last-child').click()`);await wait(`!document.querySelector('[role=dialog]')`);
  await run(`(()=>{const d=document.createElement('dialog');d.open=true;d.innerHTML='<input value="Other draft">';document.body.append(d);d.querySelector('input').focus()})()`);await shortcut();
  assert.equal(await run(`Boolean(document.querySelector('[role=dialog]'))`),false,'search must not stack over another open dialog');await run(`document.querySelector('dialog').remove()`);
 }
 await search('microphone');await key('Enter','isComposing:true');await key('ArrowDown','isComposing:true');
 assert.equal(await run(`document.activeElement?.type`),'search','IME candidate navigation stays in the input');
 await key('Enter','keyCode:229');assert.equal(await run(`document.querySelector('[role=dialog] input')?.value`),'microphone','legacy IME enter does not activate a result');
 await key('Enter');await wait(`document.querySelector('[role=dialog] h2')?.textContent==='Device check'`);
 await wait(`document.querySelector('[role=dialog]')?.contains(document.activeElement)`);
 await run(`document.querySelector('[role=dialog]>button:last-child').click()`);await wait(`!document.querySelector('[role=dialog]')`);
 await search('calendar');await key('ArrowDown');assert.equal(await run(`document.activeElement?.hasAttribute('data-search-result')`),true);
 await shortcut();assert.equal(await run(`document.activeElement?.value`),'calendar','repeat shortcut focuses the existing search without clearing it');
 await run(`(()=>{const d=document.createElement('dialog');d.open=true;d.innerHTML='<input value="Nested draft">';document.body.append(d);d.querySelector('input').focus()})()`);await shortcut();
 assert.equal(await run(`document.activeElement?.value`),'Nested draft','a later modal stays focused even when search is already open');await run(`document.querySelector('dialog').remove()`);await shortcut();
 await input('[role=dialog] input[type=search]','zz-no-match');await wait(`!document.querySelector('[data-search-result]')`);await key('Enter');assert.ok(await run(`!!document.querySelector('[role=dialog] input[type=search]')`),'empty result enter stays in search');
 const output=path.join(root,'outputs/workspace-search-keyboard');fs.mkdirSync(output,{recursive:true});
 await input('[role=dialog] input[type=search]','calendar');await wait(`!!document.querySelector('[data-search-result]')`);await key('ArrowDown');
 for(const [locale,width] of [['en',1366],['zh-CN',1024],['zh-TW',390],['vi',320]]){
  await run(`window.fixtureRender(${JSON.stringify(locale)},'student')`);await wait(`!document.querySelector('[role=dialog]')`);win.setContentSize(width,900);await search('calendar');await key('ArrowDown');
  await wait(`(()=>{const d=document.querySelector('[role=dialog]');return getComputedStyle(d).opacity==='1'&&d.getAnimations().every(a=>a.playState!=='running')})()`);
  const bounds=await run(`(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:d.scrollWidth>d.clientWidth,focused:document.activeElement.textContent}})()`);
  assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=900&&!bounds.overflow,JSON.stringify(bounds));
  fs.writeFileSync(path.join(output,`${locale}-${width}.png`),(await win.webContents.capturePage()).toPNG());
 }
 assert.deepEqual(writes,[],'keyboard checks do not submit class data or start device permissions');
 fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({passed:true,checks:['draft preserved','other modal protected','IME preserved','input Enter opens first result','repeat shortcut preserves query','empty result stays open','four locales and widths'],boundary:'Actual workspace, search input and Radix dialogs; identity/APIs and device check contents are fixtures. No hardware permission or backend write.'},null,2));
 console.log('PASS workspace search keyboard, modal drafts, IME, empty results and four locale layouts');
}
async function finish(code){
 win?.destroy();
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 fs.rmSync(temp,{recursive:true,force:true});
 setImmediate(()=>{if(code)app.exit(code);else app.quit();});
}
main().then(()=>finish(0),err=>{console.error(err);return finish(1)});
