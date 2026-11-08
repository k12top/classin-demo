const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

async function harness(){
 const windows=[],handlers=new Map(),messages=[];
 class Window extends EventEmitter{
  constructor(){super();this.url='';this.closed=false;this.webContents=new EventEmitter();this.webContents.mainFrame={};Object.assign(this.webContents,{getURL:()=>this.url,setWindowOpenHandler:()=>{},insertCSS:async()=>{},stop:()=>{this.stopped=true;}});windows.push(this);}
  isDestroyed(){return this.closed;}isFocused(){return false;}show(){}focus(){this.focused=true;}
  async loadURL(url){this.url=url;this.webContents.mainFrame.url=url;this.webContents.emit('did-navigate',{},url);}
 }
 const app=new EventEmitter();Object.assign(app,{isPackaged:true,requestSingleInstanceLock:()=>true,whenReady:async()=>{},setAccessibilitySupportEnabled:()=>{}});
 const ses={setPermissionCheckHandler:fn=>{ses.check=fn;},setPermissionRequestHandler:()=>{},setDisplayMediaRequestHandler:()=>{}};
 const electron={app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},session:{defaultSession:ses},protocol:{registerSchemesAsPrivileged:()=>{},handle:()=>{}},Menu:{setApplicationMenu:()=>{},buildFromTemplate:x=>x},dialog:{showMessageBox:async(_w,opts)=>messages.push(opts.message)},shell:{openExternal:async()=>{}},systemPreferences:{},net:{},desktopCapturer:{}};
 const filename=path.resolve(__dirname,'../src/main.cjs');
 const localRequire=name=>name==='electron'?electron:name==='./api-client.cjs'?{createApiClient:()=>async(_operation,args)=>({ok:true,data:{allowed:true,classroomUrl:'/classroom?sessionId='+args.sessionId}})}:name.startsWith('.')?require(path.resolve(path.dirname(filename),name)):require(name);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:localRequire,__dirname:path.dirname(filename),process:{env:{},platform:'darwin'},URL,Response,Headers,Set,Map},{filename});
 await new Promise(resolve=>setImmediate(resolve));
 const event=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 return{windows,handlers,messages,ses,event};
}
test('native and remote SPA/full entries cannot keep two classrooms connected',async()=>{
 const h=await harness(),home=h.windows[0];
 assert.equal((await h.handlers.get('home:enter')(h.event(home),{courseId:'c',sessionId:'room-a'})).ok,true);
 const room=h.windows[1];
 // Opening a second room natively cannot create a second window.
 assert.equal((await h.handlers.get('home:enter')(h.event(home),{courseId:'c',sessionId:'room-b'})).status,409);
 assert.equal(h.windows.length,2);
 await h.handlers.get('home:navigate')(h.event(home),'course',{courseId:'c'});
 const portal=h.windows[2],original=portal.url,target='https://live.xiangyuwenshu.cn/classroom?sessionId=room-b';
 // Full document navigation is cancelled before loading.
 let cancelled=false;portal.webContents.emit('will-navigate',{preventDefault:()=>{cancelled=true;}},target);assert.equal(cancelled,true);assert.equal(portal.url,original);
 // A renderer-brokered SPA entry is denied before mounting the second room.
 assert.equal((await h.handlers.get('client:enter')(h.event(portal),target)).status,409);assert.equal(h.windows.length,3);
 // Even an unbrokered history transition is torn down, media denied, and restored.
 portal.url=target;portal.webContents.mainFrame.url=target;
 assert.equal(h.ses.check(portal.webContents,'media','https://live.xiangyuwenshu.cn',{requestingUrl:target,isMainFrame:true}),false);
 portal.webContents.emit('did-navigate-in-page',{},target,true);assert.equal(portal.stopped,true);assert.equal(portal.url,original);assert.equal(room.focused,true);assert.ok(h.messages.length>=2);
 // Leaving the first room releases its claim and permits a new lesson.
 await room.loadURL('https://live.xiangyuwenshu.cn/courses/c');
 assert.equal((await h.handlers.get('client:enter')(h.event(portal),target)).ok,true);assert.equal(h.windows.at(-1).url,target);
});
test('reopening personnel navigation delivers a fresh one-use destination',async()=>{
 const h=await harness(),home=h.windows[0];
 await h.handlers.get('home:enter')(h.event(home),{courseId:'c',sessionId:'a'});const room=h.windows[1];
 h.handlers.get('client:open-workspace')(h.event(room));const people=h.windows[2];
 const before=h.handlers.get('client:context')(h.event(people));assert.equal(before.preferredTab,'members');
 h.handlers.get('home:people')(h.event(home));const after=h.handlers.get('client:context')(h.event(people));
 assert.equal(h.windows.length,3);assert.equal(after.preferredTab,'groups');assert.ok(after.navigationId>before.navigationId);
});
test('remote preload intercepts classroom SPA navigation before requesting native entry',()=>{
 let navigate,prevented=false,call;
 const url='https://live.xiangyuwenshu.cn/courses/c';
 const filename=path.resolve(__dirname,'../src/preload.cjs');
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:()=>{}},ipcRenderer:{invoke:(...args)=>{call=args;return Promise.resolve();}}}),URL,process:{argv:['--classroom-origin=https://live.xiangyuwenshu.cn'],platform:'darwin'},window:(()=>{const w={location:new URL(url),navigation:{addEventListener:(_name,fn)=>{navigate=fn;}},addEventListener:()=>{}};w.top=w;return w;})()},{filename});
 navigate({cancelable:true,destination:{url:'https://live.xiangyuwenshu.cn/classroom?sessionId=b'},preventDefault:()=>{prevented=true;}});
 assert.equal(prevented,true);assert.deepEqual(Array.from(call),['client:enter','https://live.xiangyuwenshu.cn/classroom?sessionId=b']);
});
