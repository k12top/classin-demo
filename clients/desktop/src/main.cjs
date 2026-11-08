const { app, BrowserWindow, desktopCapturer, ipcMain, shell, protocol, net, Menu, session, systemPreferences, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { webBase, classroomContext } = require('./client-contract.cjs');
const { HOME_URL, CAPTURE_URL, navigationFor, verifiedClassroomUrl, trustedMediaFrame } = require('./home-contract.cjs');
const { createApiClient } = require('./api-client.cjs');
const base = webBase(process.env.CLASSROOM_WEB_URL || (app.isPackaged ? 'https://live.xiangyuwenshu.cn' : 'http://localhost:3000'));
const workspaceUrl = 'classroom-client://app/index.html';
let homeWindow, workspaceWindow, workspaceOwner, api, capture, preferredTab, workspaceNavigation=0;
const webWindows = new Set();
const roomClaims = new Map();
protocol.registerSchemesAsPrivileged([{ scheme: 'classroom-client', privileges: { standard: true, secure: true } }]);
const topFrame = (event, window) => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === event.sender.mainFrame;
const contextOf = window => { try { return window && !window.isDestroyed() ? classroomContext(window.webContents.getURL(), base) : null; } catch { return null; } };
function claimedContext(window) { return contextOf(window) || roomClaims.get(window); }
function currentClassroom() { return [...webWindows].find(window=>claimedContext(window) && window.isFocused()) || [...webWindows].find(window=>claimedContext(window)); }
function classroomConflict(target, source) {
  const context=classroomContext(target,base);
  if(!context)return null;
  return [...webWindows].find(window=>window!==source && claimedContext(window));
}
function focusExistingClassroom(window) {
  window.show();window.focus();
  void dialog.showMessageBox(window,{type:'info',title:'当前课堂尚未退出',message:'请先退出当前课堂，再进入其他课节。',buttons:['返回当前课堂']});
}
function requireLocal(event, window, url) { if (!topFrame(event, window) || event.senderFrame.url !== url) throw new Error('Untrusted client frame'); }
function requireClassroom(event) {
  const window = [...webWindows].find(window=>topFrame(event,window));
  if (!window || new URL(event.senderFrame.url).origin !== base) throw new Error('Untrusted classroom frame');
  return window;
}
const safeResult = action => async (...args) => { try { return await action(...args); } catch (error) { return { ok:false, status:0, error:error.message || '操作未完成，请重试。' }; } };
function focusHome() { if (!homeWindow || homeWindow.isDestroyed()) createHome(); homeWindow.show(); homeWindow.focus(); }
function lockLocal(window, url) {
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
}
function createHome() {
  homeWindow=new BrowserWindow({width:1366,height:860,minWidth:1024,minHeight:700,title:'翔宇文淑课堂',backgroundColor:'#f5f5f5',
    webPreferences:{preload:path.join(__dirname,'home/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  lockLocal(homeWindow,HOME_URL);
  homeWindow.on('closed',()=>{homeWindow=null;});
  void homeWindow.loadURL(HOME_URL);
}
function openRemote(url, classroom=false) {
  const context=classroomContext(url,base),active=currentClassroom();
  if(context && active){if(claimedContext(active)?.sessionId!==context.sessionId)focusExistingClassroom(active);else{active.show();active.focus();}return active;}
  const existing=classroom?[...webWindows].find(window=>contextOf(window)?.sessionId===classroomContext(url,base)?.sessionId):[...webWindows].find(window=>!contextOf(window));
  if(existing){existing.show();existing.focus();if(existing.webContents.getURL()!==url)void existing.loadURL(url);return existing;}
  const window=new BrowserWindow({width:1440,height:920,minWidth:1024,minHeight:700,title:'翔宇文淑课堂',backgroundColor:'#f5f5f7',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),additionalArguments:[`--classroom-origin=${base}`],contextIsolation:true,nodeIntegration:false,sandbox:true}});
  webWindows.add(window);
  if(context)roomClaims.set(window,context);
  let safeUrl=context?new URL('/?view=courses',base).toString():url;
  window.webContents.setWindowOpenHandler(({url:target})=>{try{const parsed=new URL(target);if(['https:','http:'].includes(parsed.protocol))void shell.openExternal(target);}catch{/* Invalid links remain closed. */}return{action:'deny'};});
  window.webContents.on('will-navigate',(event,target)=>{try{
    if(!['https:','http:'].includes(new URL(target).protocol)){event.preventDefault();return;}
    const conflict=classroomConflict(target,window);if(conflict){event.preventDefault();focusExistingClassroom(conflict);}
  }catch{event.preventDefault();}});
  const navigated=(_event,target)=>{
    if(capture?.owner===window)cancelCapture();
    const conflict=classroomConflict(target,window);
    if(conflict){window.webContents.stop();roomClaims.delete(window);void window.loadURL(safeUrl);focusExistingClassroom(conflict);return;}
    const next=classroomContext(target,base);if(next)roomClaims.set(window,next);else roomClaims.delete(window);safeUrl=target;
  };
  window.webContents.on('did-navigate',navigated);
  window.webContents.on('did-navigate-in-page',(event,target,isMainFrame)=>{if(isMainFrame)navigated(event,target);});
  window.webContents.on('dom-ready',()=>{try{if(new URL(window.webContents.getURL()).origin===base)void window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'client-classroom.css'),'utf8'));}catch{/* No bridge styling on SSO pages. */}});
  window.webContents.on('will-navigate',()=>{if(capture?.owner===window)cancelCapture();});
  window.on('closed',()=>{webWindows.delete(window);roomClaims.delete(window);if(capture?.owner===window)cancelCapture();if(workspaceOwner===window)workspaceOwner=null;});
  void window.loadURL(url);return window;
}
function openWorkspace(owner=currentClassroom(),tab='members') {
  preferredTab=tab==='groups'?'groups':'members';workspaceNavigation++;
  workspaceOwner=owner;
  if(workspaceWindow&&!workspaceWindow.isDestroyed()){workspaceWindow.show();workspaceWindow.focus();return;}
  workspaceWindow=new BrowserWindow({parent:owner||homeWindow,width:1080,height:800,minWidth:720,minHeight:560,title:'课堂人员工作台',backgroundColor:'#f4f6fa',
    webPreferences:{preload:path.join(__dirname,'workspace/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  lockLocal(workspaceWindow,workspaceUrl);workspaceWindow.on('closed',()=>{workspaceWindow=null;workspaceOwner=null;});void workspaceWindow.loadURL(workspaceUrl);
}
function cancelCapture() { if(capture)capture.finish({}); }
async function startCapture(request,callback) {
  const owner=[...webWindows].find(window=>request.frame===window.webContents.mainFrame && trustedMediaFrame(request.frame?.url,base));
  if(!owner||!request.userGesture||!request.videoRequested){callback({});return;}
  cancelCapture();
  const picker=new BrowserWindow({parent:owner,modal:true,width:760,height:620,minWidth:600,minHeight:430,title:'选择共享窗口',backgroundColor:'#f5f5f7',
    webPreferences:{preload:path.join(__dirname,'capture/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  let settled=false;
  const pending={owner,picker,frame:request.frame,request,ids:new Set(),finish:streams=>{if(settled)return;settled=true;if(capture===pending)capture=null;try{callback(streams);}finally{if(!picker.isDestroyed())picker.close();}}};
  capture=pending;lockLocal(picker,CAPTURE_URL);picker.on('closed',()=>pending.finish({}));void picker.loadURL(CAPTURE_URL);
}
function installMediaPolicy(ses) {
  const allowed=(contents,url)=>[...webWindows].some(window=>!window.isDestroyed()&&window.webContents===contents&&trustedMediaFrame(window.webContents.getURL(),base)&&!classroomConflict(window.webContents.getURL(),window)&&trustedMediaFrame(url,base));
  ses.setPermissionCheckHandler((contents,permission,origin,details)=>{
    if(details.isMainFrame===false||!['media','display-capture','fullscreen','speaker-selection'].includes(permission))return false;
    try{return new URL(origin).origin===base&&allowed(contents,details.requestingUrl||contents?.getURL());}catch{return false;}
  });
  ses.setPermissionRequestHandler((contents,permission,callback,details)=>{
    if(details.isMainFrame===false||!allowed(contents,details.requestingUrl)){callback(false);return;}
    if(['fullscreen','display-capture','speaker-selection'].includes(permission)){callback(true);return;}
    if(permission!=='media'){callback(false);return;}
    void(async()=>{try{
      const types=details.mediaTypes||[];
      if(process.platform==='darwin')for(const type of types){const kind=type==='video'?'camera':type==='audio'?'microphone':null;if(kind&&!await systemPreferences.askForMediaAccess(kind)){callback(false);return;}}
      callback(allowed(contents,details.requestingUrl));
    }catch{callback(false);}})();
  });
  // The OS picker is preferred when Electron/macOS supports it. Else our picker
  // requires an explicit source click; no default screen is ever selected.
  ses.setDisplayMediaRequestHandler((request,callback)=>{let settled=false;const respond=streams=>{if(settled)return;settled=true;callback(streams);};void startCapture(request,respond).catch(()=>respond({}));},{useSystemPicker:true});
}
if(app.requestSingleInstanceLock()){
app.on('second-instance',()=>{void app.whenReady().then(focusHome);});
app.whenReady().then(()=>{
  app.setAccessibilitySupportEnabled(true);
  const ses=session.defaultSession;api=createApiClient({session:ses,base});installMediaPolicy(ses);
  const assets=new Map();
  for(const file of ['index.html','workspace.js','workspace.css'])assets.set('app/'+file,path.join(__dirname,'workspace',file));
  for(const file of ['index.html','home.js','home.css','model.js'])assets.set('home/'+file,path.join(__dirname,'home',file));
  for(const file of ['index.html','capture.js','capture.css'])assets.set('capture/'+file,path.join(__dirname,'capture',file));
  assets.set('home/design.css',path.join(__dirname,'../design/classin-v5/style.css'));
  assets.set('home/time.js',path.join(__dirname,'../design/classin-v5/time.js'));
  for(const file of ['ocean.png','canyon.png','forest.png'])assets.set('home/assets/'+file,path.join(__dirname,'../design/classin-v5/assets',file));
  protocol.handle('classroom-client',async request=>{
    const url=new URL(request.url),file=assets.get(url.hostname+url.pathname);
    if(!file||url.username||url.password||request.method!=='GET')return new Response('Not found',{status:404});
    const response=await net.fetch(pathToFileURL(file).toString()),headers=new Headers(response.headers);headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,headers});
  });
  ipcMain.handle('home:request',safeResult(async(event,operation,args)=>{requireLocal(event,homeWindow,HOME_URL);if(!['identity','courses','course','sessions','groups','createCourse'].includes(operation))throw new Error('Unsupported home operation');return api(operation,args);}));
  ipcMain.handle('home:navigate',safeResult(async(event,page,args)=>{requireLocal(event,homeWindow,HOME_URL);openRemote(navigationFor(page,args,base));return{ok:true};}));
  ipcMain.handle('home:enter',safeResult(async(event,args)=>{
    requireLocal(event,homeWindow,HOME_URL);const result=await api('verifyAccess',args);if(!result.ok)return result;
    const target=verifiedClassroomUrl(result.data,base,args?.sessionId),active=currentClassroom();
    if(active&&claimedContext(active).sessionId!==classroomContext(target,base).sessionId){active.show();active.focus();return{ok:false,status:409,error:'请先在当前课堂中退出，再进入其他课节。'};}
    openRemote(target,true);return{ok:true};
  }));
  ipcMain.handle('home:people',event=>{requireLocal(event,homeWindow,HOME_URL);openWorkspace(currentClassroom(),'groups');});
  ipcMain.handle('home:focus-classroom',event=>{requireLocal(event,homeWindow,HOME_URL);const window=currentClassroom();if(window){window.show();window.focus();}});
  ipcMain.handle('client:enter',safeResult(async(event,target)=>{
    const owner=requireClassroom(event);
    const url=verifiedClassroomUrl({allowed:true,classroomUrl:target},base);
    const active=currentClassroom();if(active&&claimedContext(active)?.sessionId!==classroomContext(url,base).sessionId){focusExistingClassroom(active);return{ok:false,status:409};}
    if(contextOf(owner)?.sessionId===classroomContext(url,base).sessionId)return{ok:true};
    openRemote(url,true);return{ok:true};
  }));
  ipcMain.handle('client:open-home',event=>{requireClassroom(event);focusHome();});
  ipcMain.handle('client:open-workspace',event=>openWorkspace(requireClassroom(event)));
  ipcMain.handle('classroom:list-desktop-sources',async event=>{const window=requireClassroom(event);if(!contextOf(window))throw new Error('Enter a classroom first');const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:320,height:180},fetchWindowIcons:true});return sources.map(source=>({id:source.id,name:source.name,displayId:source.display_id,thumbnailDataUrl:source.thumbnail.toDataURL()}));});
  ipcMain.handle('client:context',event=>{requireLocal(event,workspaceWindow,workspaceUrl);const context=contextOf(workspaceOwner);return{hasClassroom:Boolean(context),sessionId:context?.sessionId||'',preferredTab,navigationId:workspaceNavigation};});
  ipcMain.handle('client:focus-classroom',event=>{requireLocal(event,workspaceWindow,workspaceUrl);const window=workspaceOwner&&!workspaceOwner.isDestroyed()?workspaceOwner:currentClassroom();if(window){window.show();window.focus();}else focusHome();});
  ipcMain.handle('client:request',safeResult(async(event,operation,args)=>{
    requireLocal(event,workspaceWindow,workspaceUrl);const context=contextOf(workspaceOwner);
    if(args?.sessionId&&args.sessionId!==context?.sessionId)return{ok:false,status:409,error:'当前课堂已切换，请重新加载花名册。'};
    return api(operation,args,context);
  }));
  ipcMain.handle('capture:sources',async event=>{
    const pending=capture;requireLocal(event,pending?.picker,CAPTURE_URL);
    if(pending.frame!==pending.owner.webContents.mainFrame||!trustedMediaFrame(pending.frame?.url,base))throw new Error('Classroom changed');
    const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:480,height:270}});
    const visible=sources.filter(source=>source.id!==pending.picker.getMediaSourceId());pending.ids=new Set(visible.map(source=>source.id));return visible.map(source=>({id:source.id,name:source.name,thumbnailDataUrl:source.thumbnail.toDataURL()}));
  });
  ipcMain.handle('capture:select',async(event,id)=>{
    const pending=capture;requireLocal(event,pending?.picker,CAPTURE_URL);
    if(!pending.ids.has(id)||pending.frame!==pending.owner.webContents.mainFrame||!trustedMediaFrame(pending.frame?.url,base))throw new Error('Invalid capture source');
    const sources=await desktopCapturer.getSources({types:['screen','window']}),source=sources.find(source=>source.id===id);if(!source)throw new Error('Source closed');
    pending.finish({video:source,...(process.platform==='win32'&&pending.request.audioRequested?{audio:'loopback'}:{})});
  });
  ipcMain.handle('capture:cancel',event=>{requireLocal(event,capture?.picker,CAPTURE_URL);cancelCapture();});
  Menu.setApplicationMenu(Menu.buildFromTemplate([...(process.platform==='darwin'?[{role:'appMenu'}]:[]),{label:'课堂',submenu:[{label:'桌面工作台',accelerator:'CmdOrCtrl+1',click:focusHome},{label:'人员工作台',accelerator:'CmdOrCtrl+2',click:()=>openWorkspace()},{label:'返回课堂',accelerator:'CmdOrCtrl+3',click:()=>{const window=currentClassroom();if(window){window.show();window.focus();}}},{type:'separator'},{role:'reload'},{role:'togglefullscreen'}]},{role:'editMenu'},{role:'windowMenu'}]));
  createHome();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createHome();});
});
}else{app.quit();}
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
