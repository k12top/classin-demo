const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {CONNECTION_URL}=require('../src/connection-recovery.cjs');

async function harness(platform='darwin',moduleMocks={}){
 const windows=[],entries=[],handlers=new Map(),messages=[];
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.url='';this.closed=false;this.webContents=new EventEmitter();this.webContents.mainFrame={};Object.assign(this.webContents,{getURL:()=>this.url,setWindowOpenHandler:()=>{},insertCSS:async()=>{},stop:()=>{this.stopped=true;}});(options.webPreferences?.preload?.endsWith('entry/preload.cjs')?entries:windows).push(this);}
  isDestroyed(){return this.closed;}isFocused(){return false;}show(){}showInactive(){this.shown=true;}focus(){this.focused=true;}getBounds(){return {x:0,y:0,width:1200,height:800};}getContentSize(){return [1200,800];}
  minimize(){this.minimized=true;}isMaximized(){return !!this.maximized;}maximize(){this.maximized=true;}unmaximize(){this.maximized=false;}close(){this.closed=true;}getMediaSourceId(){return 'window:picker';}
  async loadURL(url){this.url=url;this.webContents.mainFrame.url=url;this.webContents.emit('did-navigate',{},url);}
 }
 const app=new EventEmitter();Object.assign(app,{isPackaged:true,requestSingleInstanceLock:()=>true,whenReady:async()=>{},setAccessibilitySupportEnabled:()=>{},getLocale:()=> 'en',getAppPath:()=>'/fixture',getPath:()=>'/fixture'});
 const ses={cookies:{get:async()=>[]},fetch:async()=>({ok:true}),setPermissionCheckHandler:fn=>{ses.check=fn;},setPermissionRequestHandler:fn=>{ses.request=fn;},setDisplayMediaRequestHandler:(fn,options)=>{ses.display=fn;ses.displayOptions=options;}};
 const desktopCapturer={getSources:async()=>[]};
 const display={id:1,bounds:{x:0,y:0,width:1440,height:900},scaleFactor:1,rotation:0},screen=new EventEmitter();Object.assign(screen,{getDisplayMatching:()=>({workArea:display.bounds}),getAllDisplays:()=>[display]});
 const electron={app,BrowserWindow:Window,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},session:{defaultSession:ses},protocol:{registerSchemesAsPrivileged:()=>{},handle:()=>{}},Menu:{setApplicationMenu:()=>{},buildFromTemplate:x=>x},dialog:{showMessageBox:async(_w,opts)=>{messages.push(opts.message);return {response:0};}},shell:{openExternal:async()=>{}},systemPreferences:{askForMediaAccess:async()=>true},screen,net:{},desktopCapturer};
 const filename=path.resolve(__dirname,'../src/main.cjs');
 const localRequire=name=>name in moduleMocks?moduleMocks[name]:name==='electron'?electron:name==='./api-client.cjs'?{createApiClient:()=>async(_operation,args)=>({ok:true,data:{allowed:true,classroomUrl:'/classroom?sessionId='+args.sessionId}})}:name.startsWith('.')?require(path.resolve(path.dirname(filename),name)):require(name);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:localRequire,__dirname:path.dirname(filename),process:{env:{},platform,resourcesPath:'/fixture/resources'},URL,Response,Headers,AbortController,AbortSignal,Set,Map,setTimeout,clearTimeout},{filename});
 await new Promise(resolve=>setImmediate(resolve));
 const event=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame});
 return{windows,entries,handlers,messages,ses,event,desktopCapturer,screen,display,shell:electron.shell};
}
test('connection recovery accepts only its owning local top frame and preserves the classroom window',async()=>{
 const h=await harness(),home=h.windows[0],target='https://live.xiangyuwenshu.cn/classroom?sessionId=lesson';
 const rejected=await h.handlers.get('connection:retry')(h.event(home));assert.equal(rejected.ok,false);
 await h.handlers.get('client:enter')(h.event(home),target);const room=h.windows[1];
 room.webContents.emit('did-fail-load',{},-105,'network',target,true);
 assert.equal(room.url,CONNECTION_URL);assert.equal(h.entries[0].closed,true);
 const state=await h.handlers.get('connection:state')(h.event(room));assert.deepEqual(Object.keys(state).sort(),['locale','reason']);
 assert.equal((await h.handlers.get('connection:retry')({...h.event(room),senderFrame:{url:CONNECTION_URL}},'https://attacker.test')).ok,false);
 assert.equal((await h.handlers.get('connection:retry')(h.event(room),'https://attacker.test')).ok,true);
 assert.equal(room.url,target);assert.equal(h.windows.length,2);
 room.webContents.emit('did-fail-load',{},-105,'network',target,true);
 assert.equal((await h.handlers.get('connection:home')(h.event(room))).ok,true);
 assert.equal(room.closed,true);assert.equal(home.focused,true);
});
test('screen ink is bound to the selected display and closes when the display changes',async()=>{
 const h=await harness(),home=h.windows[0];await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows[1];
 const source={id:'screen:1:0',display_id:'1',name:'Screen',thumbnail:{isEmpty:()=>true}};h.desktopCapturer.getSources=async()=>[source];
 h.ses.display({frame:room.webContents.mainFrame,userGesture:true,videoRequested:true},()=>{});const picker=h.windows.at(-1);await h.handlers.get('capture:sources')(h.event(picker));await h.handlers.get('capture:select')(h.event(picker),source.id);
 h.handlers.get('client:sharing-state')(h.event(room),true);const bar=h.windows.at(-1);bar.webContents.send=()=>{};let sent;room.webContents.send=(channel,value)=>{sent={channel,value}};
 h.handlers.get('client:sharing-controls')(h.event(room),{microphoneOn:false,cameraOn:false,microphoneEnabled:true,cameraEnabled:true,membersEnabled:true,inkEnabled:true});
 h.handlers.get('sharebar:action')(h.event(bar),'ink');const ink=h.windows.at(-1);assert.equal(ink.url,'classroom-client://shareink/index.html');
 h.handlers.get('shareink:stroke')(h.event(ink),{points:[{x:.5,y:.5}]});assert.equal(sent.channel,'client:screen-ink');assert.equal(sent.value.aspect,900/1440);
 assert.throws(()=>h.handlers.get('shareink:stroke')(h.event(home),{points:[{x:0,y:0}]}),/Untrusted/);
 assert.throws(()=>h.handlers.get('shareink:stroke')(h.event(ink),{points:[{x:2,y:0}]}),/Invalid stroke/);
 h.display.bounds.width=1200;h.screen.emit('display-metrics-changed');assert.equal(ink.closed,true);
 assert.throws(()=>h.handlers.get('shareink:stroke')(h.event(ink),{points:[{x:0,y:0}]}),/Untrusted/);
 assert.throws(()=>h.handlers.get('sharebar:action')(h.event(bar),'ink'),/unavailable/);
 h.display.bounds.width=1440;h.handlers.get('sharebar:action')(h.event(bar),'ink');const anotherInk=h.windows.at(-1);
 h.handlers.get('client:sharing-controls')(h.event(room),{microphoneOn:false,cameraOn:false,microphoneEnabled:true,cameraEnabled:true,membersEnabled:true,inkEnabled:false});assert.equal(anotherInk.closed,true,'revoking whiteboard availability closes the overlay');
 assert.throws(()=>h.handlers.get('sharebar:action')(h.event(bar),'ink'),/unavailable/);
 h.handlers.get('client:sharing-controls')(h.event(room),{microphoneOn:false,cameraOn:false,microphoneEnabled:true,cameraEnabled:true,membersEnabled:true,inkEnabled:true});h.handlers.get('sharebar:action')(h.event(bar),'ink');const finalInk=h.windows.at(-1);
 h.handlers.get('client:sharing-state')(h.event(room),false);assert.equal(finalInk.closed,true,'stopping sharing closes the overlay');
});
test('capture enumeration cannot complete after the classroom navigates',async()=>{
 const h=await harness(),home=h.windows[0];let result,resolveSources;
 await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows.at(-1);
 h.desktopCapturer.getSources=()=>new Promise(resolve=>{resolveSources=resolve;});
 h.ses.display({frame:room.webContents.mainFrame,userGesture:true,videoRequested:true},value=>{result=value;});
 const picker=h.windows.at(-1),reading=h.handlers.get('capture:sources')(h.event(picker));
 await room.loadURL('https://live.xiangyuwenshu.cn/courses/c');
 resolveSources([{id:'screen:1',name:'Screen',thumbnail:{isEmpty:()=>true}}]);
 await assert.rejects(reading,/Classroom changed/);assert.deepEqual(Object.keys(result),[]);
});
test('screen capture always goes through the explicit preview picker',async()=>{
 const h=await harness(),home=h.windows[0];assert.notEqual(h.ses.displayOptions?.useSystemPicker,true);
 await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows[1];let result;
 h.ses.display({frame:room.webContents.mainFrame,userGesture:false,videoRequested:true},value=>{result=value;});assert.deepEqual(Object.keys(result),[]);assert.equal(h.windows.length,2);
 h.ses.display({frame:room.webContents.mainFrame,userGesture:true,videoRequested:true},value=>{result=value;});assert.equal(h.windows.at(-1).url,'classroom-client://capture/index.html');assert.notEqual(h.windows.at(-1),room);
});
test('a delayed source selection cannot start sharing after navigation',async()=>{
 const h=await harness(),home=h.windows[0];let result,resolveSources,calls=0;
 await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows.at(-1);
 const source={id:'screen:1',name:'Screen',thumbnail:{isEmpty:()=>true}};
 h.desktopCapturer.getSources=()=>++calls===1?Promise.resolve([source]):new Promise(resolve=>{resolveSources=resolve;});
 h.ses.display({frame:room.webContents.mainFrame,userGesture:true,videoRequested:true},value=>{result=value;});
 const picker=h.windows.at(-1);await h.handlers.get('capture:sources')(h.event(picker));
 const selecting=h.handlers.get('capture:select')(h.event(picker),'screen:1');
 await room.loadURL('https://live.xiangyuwenshu.cn/courses/c');resolveSources([source]);
 await assert.rejects(selecting,/Classroom changed/);assert.deepEqual(Object.keys(result),[]);
});
test('native and remote SPA/full entries cannot keep two classrooms connected',async()=>{
 const h=await harness(),home=h.windows[0];
 assert.equal(home.url,'https://live.xiangyuwenshu.cn/');
 assert.equal((await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=room-a')).ok,true);
 const room=h.windows[1];
 assert.notEqual(room,home);assert.equal(home.url,'https://live.xiangyuwenshu.cn/');assert.equal(room.url,'https://live.xiangyuwenshu.cn/classroom?sessionId=room-a');
 // Opening a second room natively cannot create a second window.
 assert.equal((await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=room-b')).status,409);
 assert.equal(h.windows.length,2);
 const portal=home,original=portal.url,target='https://live.xiangyuwenshu.cn/classroom?sessionId=room-b';
 // Full document navigation is cancelled before loading.
 let cancelled=false;portal.webContents.emit('will-navigate',{preventDefault:()=>{cancelled=true;}},target);assert.equal(cancelled,true);assert.equal(portal.url,original);
 // A renderer-brokered SPA entry is denied before mounting the second room.
 assert.equal((await h.handlers.get('client:enter')(h.event(portal),target)).status,409);assert.equal(h.windows.length,2);
 // Even an unbrokered history transition is torn down, media denied, and restored.
 portal.url=target;portal.webContents.mainFrame.url=target;
 assert.equal(h.ses.check(portal.webContents,'media','https://live.xiangyuwenshu.cn',{requestingUrl:target,isMainFrame:true}),false);
 portal.webContents.emit('did-navigate-in-page',{},target,true);assert.equal(portal.stopped,true);assert.equal(portal.url,original);assert.equal(room.focused,true);assert.ok(h.messages.length>=2);
 // Leaving the first room releases its claim and permits a new lesson.
 await room.loadURL('https://live.xiangyuwenshu.cn/courses/c');
 assert.equal((await h.handlers.get('client:enter')(h.event(portal),target)).ok,true);assert.equal(h.windows.at(-1).url,target);
});
test('leaving a classroom closes its window and focuses the original workspace',async()=>{
 const h=await harness(),home=h.windows[0];
 await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');
 const room=h.windows[1];h.handlers.get('client:close-classroom')(h.event(room));
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(room.closed,true);assert.equal(home.closed,false);assert.equal(home.focused,true);
 assert.throws(()=>h.handlers.get('client:close-classroom')(h.event(home)),/Not a classroom window/);
});
test('only a classroom can enable background activity while sharing',async()=>{
 const h=await harness(),home=h.windows[0];
 await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows[1];
 h.handlers.get('client:sharing-state')(h.event(room),true);assert.equal(room.webContents.backgroundThrottling,false);
 const bar=h.windows.at(-1);assert.equal(bar.url,'classroom-client://sharebar/index.html');let command;room.webContents.send=(_channel,value)=>{command=value;};
 bar.webContents.send=()=>{};assert.throws(()=>h.handlers.get('sharebar:action')(h.event(bar),'camera'),/Control unavailable/);
 h.handlers.get('client:sharing-controls')(h.event(room),{microphoneOn:false,cameraOn:true,microphoneEnabled:true,cameraEnabled:false,membersEnabled:true});
 h.handlers.get('sharebar:action')(h.event(bar),'microphone');assert.equal(command,'microphone');assert.throws(()=>h.handlers.get('sharebar:action')(h.event(bar),'camera'),/Control unavailable/);
 h.handlers.get('client:sharing-seats')(h.event(room),{x:10,y:20,width:600,height:100});const seats=h.windows.at(-1);assert.equal(seats.url,'classroom-client://shareseats/index.html');
 h.handlers.get('shareseats:members')(h.event(seats));assert.equal(command,'members');assert.throws(()=>h.handlers.get('shareseats:members')(h.event(home)),/Untrusted/);
 h.handlers.get('client:sharing-controls')(h.event(room),{microphoneOn:false,cameraOn:true,microphoneEnabled:true,cameraEnabled:false,membersEnabled:false});command='unchanged';h.handlers.get('shareseats:members')(h.event(seats));assert.equal(command,'unchanged');
 h.handlers.get('client:sharing-seats')(h.event(room),{x:-1,y:0,width:600,height:100});assert.equal(seats.closed,true);
 h.handlers.get('sharebar:action')(h.event(bar),'stop');assert.equal(command,'stop');h.handlers.get('sharebar:action')(h.event(bar),'show');assert.equal(room.focused,true);
 assert.throws(()=>h.handlers.get('sharebar:action')(h.event(home),'stop'),/Untrusted/);
 h.handlers.get('client:sharing-state')(h.event(room),false);assert.equal(room.webContents.backgroundThrottling,true);
 assert.equal(bar.closed,true);
 assert.throws(()=>h.handlers.get('client:sharing-state')(h.event(home),true),/Invalid classroom/);
 assert.throws(()=>h.handlers.get('client:sharing-state')(h.event(room),'true'),/Invalid classroom/);
 h.handlers.get('client:sharing-state')(h.event(room),true);await room.loadURL('https://live.xiangyuwenshu.cn/courses/c');assert.equal(room.webContents.backgroundThrottling,true);
});
test('unexpected sharing toolbar closure also closes its chat window',async()=>{
 const h=await harness(),home=h.windows[0];
 await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows[1];
 h.handlers.get('client:sharing-state')(h.event(room),true);const bar=h.windows.at(-1);
 h.handlers.get('sharebar:action')(h.event(bar),'chat');const chat=h.windows.at(-1);
 assert.equal(chat.url,'classroom-client://sharechat/index.html');
 bar.closed=true;bar.emit('closed');
 assert.equal(chat.closed,true,'chat must not remain visible after its toolbar closes');
 assert.throws(()=>h.handlers.get('sharechat:ready')(h.event(chat)),/Untrusted/);
});
test('a delayed close cannot close a window that has changed classrooms',async()=>{
 const h=await harness(),home=h.windows[0];
 await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');
 const room=h.windows[1];h.handlers.get('client:close-classroom')(h.event(room));
 await room.loadURL('https://live.xiangyuwenshu.cn/classroom?sessionId=other');
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(room.closed,false);
});
test('remote preload exposes classroom entry and intercepts older SPA navigation',async()=>{
 let navigate,prevented=false,call,bridge;
 const url='https://live.xiangyuwenshu.cn/courses/c';
 const filename=path.resolve(__dirname,'../src/preload.cjs');
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}},ipcRenderer:{invoke:(...args)=>{call=args;return Promise.resolve();}}}),URL,process:{argv:['--classroom-origin=https://live.xiangyuwenshu.cn'],platform:'darwin'},window:(()=>{const w={location:new URL(url),navigation:{addEventListener:(_name,fn)=>{navigate=fn;}},addEventListener:()=>{}};w.top=w;return w;})()},{filename});
 await bridge.enterClassroom('https://live.xiangyuwenshu.cn/classroom?sessionId=a');assert.deepEqual(Array.from(call),['client:enter','https://live.xiangyuwenshu.cn/classroom?sessionId=a']);
 await bridge.closeClassroom();assert.deepEqual(Array.from(call),['client:close-classroom']);
 navigate({cancelable:true,destination:{url:'https://live.xiangyuwenshu.cn/classroom?sessionId=b'},preventDefault:()=>{prevented=true;}});
 assert.equal(prevented,true);assert.deepEqual(Array.from(call),['client:enter','https://live.xiangyuwenshu.cn/classroom?sessionId=b']);
});

test('shared home remains separate from classrooms for full and in-page navigation',async()=>{
 const h=await harness(),home=h.windows[0],target='https://live.xiangyuwenshu.cn/classroom?sessionId=lesson';
 let cancelled=false;home.webContents.emit('will-navigate',{preventDefault:()=>{cancelled=true;}},target);
 assert.equal(cancelled,true);assert.equal(home.url,'https://live.xiangyuwenshu.cn/');assert.equal(h.windows[1].url,target);
 await h.windows[1].loadURL('https://live.xiangyuwenshu.cn/courses/c');
 home.url=target;home.webContents.mainFrame.url=target;home.webContents.emit('did-navigate-in-page',{},target,true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(home.url,'https://live.xiangyuwenshu.cn/');assert.equal(h.windows.at(-1).url,target);assert.notEqual(h.windows.at(-1),home);
});

test('desktop windows use operating system controls without an extra frame',async()=>{
 const macHarness=await harness('darwin'),mac=macHarness.windows[0].options;
 assert.equal(mac.titleBarStyle,'hidden');
 assert.equal(mac.trafficLightPosition.x,12);
 assert.equal(mac.trafficLightPosition.y,16);
 assert.equal(mac.frame,undefined);
 const winHarness=await harness('win32'),win=winHarness.windows[0].options;
 assert.equal(win.titleBarStyle,'hidden');
 assert.equal(win.titleBarOverlay.height,44);
 assert.equal(win.titleBarOverlay.color,'#00000000');
 assert.equal(win.frame,undefined);
 for(const [h,platform] of [[macHarness,'mac'],[winHarness,'windows']]){
  const home=h.windows[0];
  await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');
  const room=h.windows[1].options;
  assert.equal(room.titleBarStyle,'hidden');
  assert.equal(room.frame,undefined);
  if(platform==='mac')assert.equal(room.trafficLightPosition.x,12);
  else assert.equal(room.titleBarOverlay.height,44);
 }
 const linux=(await harness('linux')).windows[0].options;
 assert.equal(linux.titleBarStyle,undefined);
});

test('device check grants one requested media type to the trusted home frame only',async()=>{
 const h=await harness(),home=h.windows[0],url=home.url,details={requestingUrl:url,isMainFrame:true};
 const check=permission=>h.ses.check(home.webContents,permission,'https://live.xiangyuwenshu.cn',details);
 const request=mediaTypes=>new Promise(resolve=>h.ses.request(home.webContents,'media',resolve,{...details,mediaTypes}));
 assert.equal(check('media'),false);
 h.handlers.get('client:prepare-device-check')(h.event(home),'video');
 assert.equal(check('media'),true);assert.equal(check('display-capture'),false);
 assert.equal(await request(['audio']),false);assert.equal(check('media'),false);
 h.handlers.get('client:prepare-device-check')(h.event(home),'video');
 assert.equal(await request(['video']),true);assert.equal(check('media'),false);
 h.handlers.get('client:prepare-device-check')(h.event(home),'audio');
 h.handlers.get('client:cancel-device-check')(h.event(home));assert.equal(check('media'),false);
 h.handlers.get('client:prepare-device-check')(h.event(home),'audio');
 home.url='https://live.xiangyuwenshu.cn/courses/other';assert.equal(check('media'),false);
 assert.throws(()=>h.handlers.get('client:prepare-device-check')({...h.event(home),senderFrame:{}},'audio'));
});

test('entry status is isolated and reveals only its classroom when ready',async()=>{
 const h=await harness(),home=h.windows[0];
 await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');
 const room=h.windows[1],entry=h.entries[0];assert.equal(room.options.show,false);assert.equal(entry.options.transparent,true);
 h.handlers.get('client:entry-ready')(h.event(home));assert.equal(entry.closed,false);
 h.handlers.get('client:entry-ready')(h.event(room));assert.equal(entry.closed,true);assert.equal(room.focused,true);
});

for(const platform of ['darwin','win32'])test(`${platform} remote control is limited to the active shared screen and stops from the floating bar`,async()=>{
 const {generateKeyPairSync,sign}=require('node:crypto'),pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'}),publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
 const lease={grantId:'grant',sessionId:'lesson',teacherId:'teacher',teacherClientId:'teacher-device',shareClaimId:'share',publicKey,leaseMs:2000},received=[];let closed;
 const receiver=async()=>({receive:packet=>(received.push(packet),true),close:reason=>{closed=reason;}});
 const mocks={'./remote-control-lease-client.cjs':{createReceiverLeaseReader:()=>async()=>lease},'./macos-remote-receiver.cjs':{startMacRemoteReceiver:receiver},'./windows-remote-receiver.cjs':{startWindowsRemoteReceiver:async input=>{assert.deepEqual(input.getPhysicalBounds(input.display),{x:0,y:0,width:2880,height:1800});return receiver();}},'./remote-helper-path.cjs':{macRemoteHelperPath:()=>'/fixture/helper',windowsRemoteHelperPath:()=> 'C:\\Fixture\\RemoteInput.exe'}};
 const h=await harness(platform,mocks),home=h.windows[0];h.screen.dipToScreenRect=(window,bounds)=>{assert.equal(window,null);assert.deepEqual(bounds,h.display.bounds);return{x:0,y:0,width:2880,height:1800};};home.webContents.send=()=>{};await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows[1];room.webContents.send=()=>{};
 assert.equal(await h.handlers.get('client:remote-start')(h.event(room),{clientId:'student',grantId:'grant'}),false,'sharing is required');
 const source={id:'screen:1:0',display_id:'1',name:'Screen',thumbnail:{isEmpty:()=>true}};h.desktopCapturer.getSources=async()=>[source];h.ses.display({frame:room.webContents.mainFrame,userGesture:true,videoRequested:true},()=>{});const picker=h.windows.at(-1);await h.handlers.get('capture:sources')(h.event(picker));await h.handlers.get('capture:select')(h.event(picker),source.id);
 h.handlers.get('client:sharing-state')(h.event(room),true);const bar=h.windows.at(-1);bar.webContents.send=()=>{};h.handlers.get('client:sharing-controls')(h.event(room),{microphoneOn:false,cameraOn:false,microphoneEnabled:true,cameraEnabled:true,membersEnabled:true});
 assert.equal(await h.handlers.get('client:remote-start')(h.event(room),{clientId:'student',grantId:'grant'}),true);assert.ok(h.messages.some(message=>message.includes('Allow the teacher')));
 const action={type:'move',x:.2,y:.3},payload=JSON.stringify([1,'lesson','grant','share',1,action]),signature=sign('sha256',Buffer.from(payload),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url'),packet={grantId:'grant',sequence:1,event:action,signature};
 assert.equal(h.handlers.get('client:remote-input')(h.event(room),packet),true);assert.equal(received.length,1);assert.equal(h.handlers.get('client:remote-input')(h.event(room),{...packet,event:{...action,x:.8}}),false);
 h.handlers.get('sharebar:action')(h.event(bar),'remote-stop');assert.equal(closed,'student-stop');assert.equal(h.handlers.get('client:remote-input')(h.event(room),packet),false);
});
for(const platform of ['darwin','win32'])test(`${platform} student reviews a server-verified control request from the sharing bar`,async()=>{
 const {generateKeyPairSync}=require('node:crypto'),pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'}),publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
 const responses=[],receiver=async()=>({receive:()=>true,close:()=>{}}),mocks={'./remote-request-client.cjs':{createRemoteRequestClient:()=>({read:async()=>[{id:'grant',teacherId:'teacher',effectiveState:'requested'}],respond:async value=>(responses.push(value),'granted')})},'./remote-control-lease-client.cjs':{createReceiverLeaseReader:()=>async()=>({grantId:'grant',sessionId:'lesson',teacherId:'teacher',teacherClientId:'teacher-device',shareClaimId:'share',publicKey,leaseMs:2000})},'./macos-remote-receiver.cjs':{startMacRemoteReceiver:receiver},'./windows-remote-receiver.cjs':{startWindowsRemoteReceiver:receiver},'./remote-helper-path.cjs':{macRemoteHelperPath:()=>'/fixture/helper',windowsRemoteHelperPath:()=> 'C:\\Fixture\\RemoteInput.exe'}};
 const h=await harness(platform,mocks),home=h.windows[0];home.webContents.send=()=>{};await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows[1],events=[];room.webContents.send=(name,data)=>events.push({name,data});
 const source={id:'screen:1:0',display_id:'1',name:'Screen',thumbnail:{isEmpty:()=>true}};h.desktopCapturer.getSources=async()=>[source];h.ses.display({frame:room.webContents.mainFrame,userGesture:true,videoRequested:true},()=>{});const picker=h.windows.at(-1);await h.handlers.get('capture:sources')(h.event(picker));await h.handlers.get('capture:select')(h.event(picker),source.id);h.handlers.get('client:sharing-state')(h.event(room),true);const bar=h.windows.at(-1),controls=[];bar.webContents.send=(_name,data)=>controls.push(data);h.handlers.get('client:sharing-controls')(h.event(room),{microphoneOn:false,cameraOn:false,microphoneEnabled:true,cameraEnabled:true,membersEnabled:true});
 assert.equal(await h.handlers.get('client:remote-pending')(h.event(room),{clientId:'student-device',grantId:'grant'}),true);assert.equal(controls.at(-1).remotePending,true);assert.equal(await h.handlers.get('sharebar:action')(h.event(bar),'remote-review'),true);assert.equal(responses[0].accept,true);assert.ok(h.messages.some(value=>value.includes('Allow the teacher')));assert.equal(controls.at(-1).remotePending,false);assert.ok(events.some(value=>value.name==='client:remote-request-state'&&value.data.decision==='granted'));
 assert.equal(await h.handlers.get('client:remote-start')(h.event(room),{clientId:'student-device',grantId:'grant'}),true);assert.equal(h.messages.filter(value=>value.includes('Allow the teacher')).length,1,'the explicit consent is reused only for the same grant and screen');
 h.handlers.get('client:remote-stop')(h.event(room));
 assert.throws(()=>h.handlers.get('sharebar:action')(h.event(home),'remote-review'),/Untrusted/);
});
test('permission guidance opens only the fixed macOS accessibility settings link',async()=>{
 const {generateKeyPairSync}=require('node:crypto'),pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'}),publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
 const mocks={'./remote-control-lease-client.cjs':{createReceiverLeaseReader:()=>async()=>({grantId:'grant',sessionId:'lesson',teacherId:'teacher',teacherClientId:'teacher-device',shareClaimId:'share',publicKey,leaseMs:2000})},'./macos-remote-receiver.cjs':{startMacRemoteReceiver:async({onClose})=>{onClose('permission-required');throw Error('permission');}},'./remote-helper-path.cjs':{macRemoteHelperPath:()=>'/fixture/helper'}};
 const h=await harness('darwin',mocks),home=h.windows[0];home.webContents.send=()=>{};await h.handlers.get('client:enter')(h.event(home),'https://live.xiangyuwenshu.cn/classroom?sessionId=lesson');const room=h.windows[1];room.webContents.send=()=>{};
 const source={id:'screen:1:0',display_id:'1',name:'Screen',thumbnail:{isEmpty:()=>true}};h.desktopCapturer.getSources=async()=>[source];h.ses.display({frame:room.webContents.mainFrame,userGesture:true,videoRequested:true},()=>{});const picker=h.windows.at(-1);await h.handlers.get('capture:sources')(h.event(picker));await h.handlers.get('capture:select')(h.event(picker),source.id);
 h.handlers.get('client:sharing-state')(h.event(room),true);const bar=h.windows.at(-1),controls=[];bar.webContents.send=(_name,value)=>controls.push(value);h.handlers.get('client:sharing-controls')(h.event(room),{microphoneOn:false,cameraOn:false,microphoneEnabled:true,cameraEnabled:true,membersEnabled:true});
 assert.throws(()=>h.handlers.get('sharebar:action')(h.event(bar),'remote-permission'),/unavailable/);
 assert.equal(await h.handlers.get('client:remote-start')(h.event(room),{clientId:'student',grantId:'grant'}),false);await new Promise(resolve=>setImmediate(resolve));assert.equal(controls.at(-1).remotePermissionRequired,true);
 let opened;h.shell.openExternal=async url=>{opened=url;};await h.handlers.get('sharebar:action')(h.event(bar),'remote-permission');assert.equal(opened,'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');assert.throws(()=>h.handlers.get('sharebar:action')(h.event(home),'remote-permission'),/Untrusted/);
});
