const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {CONNECTION_URL,recoveryTarget,createConnectionRecovery}=require('../src/connection-recovery.cjs');
const base='https://live.example.test';
function setup(){
 const contents=new EventEmitter(),window=new EventEmitter(),loads=[],timers=new Map();let time=0,stops=0,recovered=0,ready=[];
 Object.assign(contents,{getURL:()=>window.url,stop:()=>stops++});
 Object.assign(window,{webContents:contents,url:base+'/',isDestroyed:()=>false,loadURL:async target=>{
  loads.push(target);contents.emit('did-start-navigation',{url:target,isMainFrame:true,isSameDocument:false});window.url=target;
 }});
 const clock={set:fn=>{const id=++time;timers.set(id,fn);return id;},clear:id=>timers.delete(id)};
 const recovery=createConnectionRecovery(window,{base,clock,onRecover:()=>recovered++,beforeRetry:target=>ready.push(target)});
 const start=url=>contents.emit('did-start-navigation',{url,isMainFrame:true,isSameDocument:false});
 const fail=(url,code=-105,main=true)=>contents.emit('did-fail-load',{},code,'fixture',url,main);
 return{contents,window,loads,timers,recovery,start,fail,stops:()=>stops,recovered:()=>recovered,ready};
}
test('page failures offer a local retry without exposing URLs or OAuth credentials',async()=>{
 const h=setup(),target=base+'/courses/course/playback?sessionId=lesson';h.start(target);h.fail(target);
 assert.equal(h.loads.at(-1),CONNECTION_URL);assert.equal(h.recovery.active,true);assert.deepEqual(h.recovery.snapshot(),{reason:'network'});assert.equal(h.recovered(),1);
 await h.recovery.retry();assert.equal(h.loads.at(-1),target);assert.deepEqual(h.ready,[target]);
 h.contents.emit('dom-ready');assert.equal(h.recovery.active,false);assert.equal(h.timers.size,0);
 await assert.rejects(h.recovery.retry(),/unavailable/);
});
test('SSO and API failures restart login without replaying a code or provider request',()=>{
 for(const target of [base+'/api/auth/callback?code=single-use&state=old','https://sso.example.test/authorize?state=old','file:///tmp/secret','invalid'])assert.equal(recoveryTarget(target,base),base+'/api/auth/login');
 assert.equal(recoveryTarget(base+'/courses/course#old',base),base+'/courses/course');
});
test('redirect failures use the final URL and stale, subframe or aborted requests do not replace the page',()=>{
 const h=setup(),first=base+'/first',second=base+'/second';h.start(first);h.start(second);
 h.fail(first);h.fail(second,-3);h.fail(second,-105,false);assert.equal(h.loads.length,0);
 const external='https://sso.example.test/authorize?state=old';h.contents.emit('did-redirect-navigation',{url:external,isMainFrame:true,isSameDocument:false});h.fail(external);
 assert.equal(h.recovery.active,true);assert.equal(h.loads.at(-1),CONNECTION_URL);
});
test('a stalled document times out, while completed and same-document loads do not',()=>{
 const h=setup(),target=base+'/slow';h.start(target);assert.equal(h.timers.size,1);[...h.timers.values()][0]();
 assert.equal(h.recovery.snapshot().reason,'timeout');assert.equal(h.loads.at(-1),CONNECTION_URL);
 const done=setup();done.start(base+'/ready');done.window.url=base+'/ready';done.contents.emit('dom-ready');assert.equal(done.timers.size,0);
 done.contents.emit('did-start-navigation',{url:base+'/#section',isMainFrame:true,isSameDocument:true});assert.equal(done.timers.size,0);
});
test('a failed document finishing after recovery starts cannot revoke the retry bridge',()=>{
 const h=setup(),target=base+'/failed';h.start(target);h.fail(target);
 h.window.url=target;h.contents.emit('dom-ready');assert.equal(h.recovery.active,true);
 h.window.url=CONNECTION_URL;h.contents.emit('dom-ready');assert.equal(h.recovery.active,true);
});
test('renderer loss releases active work and window closure cancels recovery',async()=>{
 const h=setup();h.contents.emit('render-process-gone');assert.equal(h.recovery.snapshot().reason,'crash');assert.equal(h.stops(),1);
 h.window.emit('closed');assert.equal(h.timers.size,0);assert.equal(h.recovery.active,false);await assert.rejects(h.recovery.home(),/unavailable/);
});
test('the recovery preload bridge exists only in the fixed local top-level page',()=>{
 for(const [url,top,expected]of [[CONNECTION_URL,true,true],[CONNECTION_URL,false,false],[base+'/',true,false],[CONNECTION_URL+'?target=external',true,false]]){
  const exposed={},window={location:new URL(url),addEventListener:()=>{}};window.top=top?window:{};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/preload.cjs'),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(name,value)=>{exposed[name]=value;}},ipcRenderer:{invoke:()=>{}}}),window,process:{platform:'linux',argv:['--classroom-origin='+base]},URL});
  assert.equal(Boolean(exposed.classroomConnection),expected);
  if(expected)assert.deepEqual(Object.keys(exposed.classroomConnection),['state','retry','home']);
 }
});
