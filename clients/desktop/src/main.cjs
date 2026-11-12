const { app, BrowserWindow, desktopCapturer, ipcMain, shell, protocol, net, Menu, session, systemPreferences, dialog, screen, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { webBase, classroomContext } = require('./client-contract.cjs');
const { HOME_URL, CAPTURE_URL, navigationFor, verifiedClassroomUrl, trustedMediaFrame } = require('./home-contract.cjs');
const { createApiClient } = require('./api-client.cjs');
const { createOfflineCourseCache, createCachedCourseReader } = require('./offline-course-cache.cjs');
const { bindSharedDisplay, sharedDisplayStillMatches } = require('./share-display.cjs');
const { normalizeShareInk } = require('./share-ink.cjs');
const { seatFrameWidth } = require('./share-seat-quality.cjs');
const { createRemoteControlManager } = require('./remote-control-manager.cjs');
const { createReceiverLeaseReader } = require('./remote-control-lease-client.cjs');
const { startMacRemoteReceiver } = require('./macos-remote-receiver.cjs');
const { startWindowsRemoteReceiver } = require('./windows-remote-receiver.cjs');
const { macRemoteHelperPath, windowsRemoteHelperPath } = require('./remote-helper-path.cjs');
const { createRemoteRequestClient } = require('./remote-request-client.cjs');
const { createRemoteRequestManager } = require('./remote-request-manager.cjs');
const { createTeacherPointer } = require('./teacher-pointer.cjs');
const { CONNECTION_URL, createConnectionRecovery } = require('./connection-recovery.cjs');
const base = webBase(process.env.CLASSROOM_WEB_URL || (app.isPackaged ? 'https://live.xiangyuwenshu.cn' : 'http://localhost:3000'));
const appIcon=path.join(__dirname,'../resources/app-icon.png');
const workspaceUrl = 'classroom-client://app/index.html';
let homeWindow, workspaceWindow, workspaceOwner, api, capture, shareBar, shareSeats, shareInk, shareChat, remoteManager, remoteRequests, remoteConsent, preferredTab, workspaceNavigation=0;
const webWindows = new Set();
const roomClaims = new Map();
const deviceChecks = new WeakMap();
const roomEntries = new WeakMap();
const connections = new WeakMap();
const entryUrl='classroom-client://entry/index.html';
const captureSources = new WeakMap();
protocol.registerSchemesAsPrivileged([{ scheme: 'classroom-client', privileges: { standard: true, secure: true } }]);
const topFrame = (event, window) => window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === event.sender.mainFrame;
const contextOf = window => { try { return window && !window.isDestroyed() ? classroomContext(window.webContents.getURL(), base) : null; } catch { return null; } };
function claimedContext(window) { return contextOf(window) || roomClaims.get(window); }
function nativeInputPath(){const options={isPackaged:app.isPackaged,resourcesPath:process.resourcesPath,appPath:app.getAppPath(),platform:process.platform};return process.platform==='win32'?windowsRemoteHelperPath(options):macRemoteHelperPath(options);}
function nativeInputReady(){try{const file=nativeInputPath();return Boolean(file&&fs.statSync(file).isFile());}catch{return false;}}
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
  // The website and Electron render the same workspace, with the existing
  // isolated preload and session used by other authenticated web windows.
  homeWindow=openRemote(new URL('/',base).toString(),false,true);
  homeWindow.on('closed',()=>{homeWindow=null;});
}
function openRemote(url, classroom=false, isHome=false) {
  const context=classroomContext(url,base),active=currentClassroom();
  if(context && active){if(claimedContext(active)?.sessionId!==context.sessionId)focusExistingClassroom(active);else{active.show();active.focus();}return active;}
  const existing=isHome?null:classroom?[...webWindows].find(window=>contextOf(window)?.sessionId===classroomContext(url,base)?.sessionId):[...webWindows].find(window=>window!==homeWindow&&!claimedContext(window));
  if(existing){existing.show();existing.focus();if(existing.webContents.getURL()!==url)void existing.loadURL(url).catch(()=>{});return existing;}
  const nativeChrome=process.platform==='darwin'
    ?{titleBarStyle:'hidden',trafficLightPosition:{x:12,y:16}}
    :process.platform==='win32'
      ?{titleBarStyle:'hidden',titleBarOverlay:{color:'#00000000',symbolColor:'#626879',height:44}}
      :{};
  const window=new BrowserWindow({icon:appIcon,show:!context,width:isHome?1366:1440,height:isHome?860:920,minWidth:1024,minHeight:700,title:'翔宇文淑课堂',backgroundColor:'#f5f5f7',...nativeChrome,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),additionalArguments:[`--classroom-origin=${base}`,...(nativeInputReady()?['--classroom-remote-input-ready']:[])],contextIsolation:true,nodeIntegration:false,sandbox:true}});
  webWindows.add(window);
  connections.set(window,createConnectionRecovery(window,{base,onRecover:()=>{
    if(capture?.owner===window)cancelCapture();
    remoteRequests?.clear(window);remoteManager?.stop(window,'navigation');
    closeShareBar(window);captureSources.delete(window);finishRoomEntry(window,true);
    if(window!==homeWindow&&!window.isDestroyed())window.showInactive();
  },beforeRetry:target=>{
    const conflict=classroomConflict(target,window);if(conflict){focusExistingClassroom(conflict);throw Error('Another classroom is active');}
    const next=classroomContext(target,base);if(next){roomClaims.set(window,next);showRoomEntry(window,next);}
  }}));
  if(context){roomClaims.set(window,context);showRoomEntry(window,context);}
  let safeUrl=context?new URL('/?view=courses',base).toString():url;
  window.webContents.setWindowOpenHandler(({url:target})=>{try{const parsed=new URL(target);if(['https:','http:'].includes(parsed.protocol))void shell.openExternal(target);}catch{/* Invalid links remain closed. */}return{action:'deny'};});
  window.webContents.on('will-navigate',(event,target)=>{try{
    if(!['https:','http:'].includes(new URL(target).protocol)){event.preventDefault();return;}
    const conflict=classroomConflict(target,window);if(conflict){event.preventDefault();focusExistingClassroom(conflict);return;}
    if(window===homeWindow && classroomContext(target,base)){event.preventDefault();openRemote(target,true);}
  }catch{event.preventDefault();}});
  const navigated=(_event,target)=>{
    if(target===CONNECTION_URL&&connections.get(window)?.active)return;
    if(capture?.owner===window)cancelCapture();
    if(roomEntries.has(window)&&!classroomContext(target,base))finishRoomEntry(window,true);
    if(shareBar?.owner===window&&classroomContext(target,base)?.sessionId!==shareBar.sessionId)closeShareBar(window);
    if(roomClaims.get(window)?.sessionId!==classroomContext(target,base)?.sessionId)captureSources.delete(window);
    if(!classroomContext(target,base))window.webContents.backgroundThrottling=true;
    const conflict=classroomConflict(target,window);
    if(conflict){window.webContents.stop();roomClaims.delete(window);void window.loadURL(safeUrl).catch(()=>{});focusExistingClassroom(conflict);return;}
    const next=classroomContext(target,base);
    if(next && window===homeWindow){
      // Older renderers may not expose cancellable Navigation API events.
      // Restore the shared home before opening the lesson in its own window.
      const previous=safeUrl;window.webContents.stop();roomClaims.delete(window);
      void window.loadURL(previous).then(()=>{if(!window.isDestroyed()&&window.webContents.getURL()===previous)openRemote(target,true);}).catch(()=>{});
      return;
    }
    if(next)roomClaims.set(window,next);else roomClaims.delete(window);safeUrl=target;
  };
  window.webContents.on('did-navigate',navigated);
  window.webContents.on('did-navigate-in-page',(event,target,isMainFrame)=>{if(isMainFrame)navigated(event,target);});
  window.webContents.on('dom-ready',()=>{if(['darwin','win32'].includes(process.platform))void window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'client-titlebar.css'),'utf8'));try{if(new URL(window.webContents.getURL()).origin===base)void window.webContents.insertCSS(fs.readFileSync(path.join(__dirname,'client-classroom.css'),'utf8'));}catch{/* No classroom styling on SSO pages. */}});
  window.webContents.on('will-navigate',()=>{if(capture?.owner===window)cancelCapture();remoteRequests?.clear(window);remoteManager?.stop(window,'navigation');});
  window.webContents.on('render-process-gone',()=>{remoteRequests?.clear(window);remoteManager?.stop(window,'renderer-gone');});
  window.webContents.on('did-fail-load',(_event,_code,_description,_url,isMainFrame)=>{if(isMainFrame)finishRoomEntry(window,true);});
  window.on('closed',()=>{finishRoomEntry(window,false);webWindows.delete(window);roomClaims.delete(window);if(capture?.owner===window)cancelCapture();closeShareBar(window);if(workspaceOwner===window)workspaceOwner=null;});
  void window.loadURL(url).catch(()=>{});return window;
}
function finishRoomEntry(owner, reveal) {
  const entry=roomEntries.get(owner);if(!entry)return;
  roomEntries.delete(owner);clearTimeout(entry.timer);
  if(!entry.window.isDestroyed())entry.window.close();
  if(reveal&&!owner.isDestroyed()){owner.show();owner.focus();}
}
function showRoomEntry(owner,context) {
  const area=screen.getDisplayMatching(owner.getBounds()).workArea;
  const width=540,height=286;
  const view=new BrowserWindow({x:Math.round(area.x+(area.width-width)/2),y:Math.round(area.y+(area.height-height)/2),width,height,frame:false,transparent:true,hasShadow:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,show:false,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'entry/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  const entry={window:view,sessionId:context.sessionId,timer:null};roomEntries.set(owner,entry);lockLocal(view,entryUrl);
  view.once('ready-to-show',()=>{if(roomEntries.get(owner)===entry)view.showInactive();});
  view.on('closed',()=>{if(roomEntries.get(owner)===entry)finishRoomEntry(owner,true);});
  entry.timer=setTimeout(()=>finishRoomEntry(owner,true),12000);entry.timer.unref?.();
  void view.loadURL(entryUrl).catch(()=>finishRoomEntry(owner,true));
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
const shareBarUrl='classroom-client://sharebar/index.html';
const shareChatUrl='classroom-client://sharechat/index.html';
function closeShareChat(owner){if(!shareChat||(owner&&shareChat.owner!==owner))return;const current=shareChat;shareChat=null;for(const finish of current.pending.values())finish(false);for(const finish of current.images.values())finish(null);if(!current.window.isDestroyed())current.window.close();}
function openShareChat(current){
 if(shareChat?.owner===current.owner&&!shareChat.window.isDestroyed()){shareChat.window.show();shareChat.window.focus();return;}
 closeShareChat();const area=screen.getDisplayMatching(current.owner.getBounds()).workArea;
 const view=new BrowserWindow({x:area.x+area.width-352,y:area.y+40,width:336,height:480,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,show:false,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'sharechat/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 const chat={window:view,owner:current.owner,sessionId:current.sessionId,pending:new Map(),images:new Map()};shareChat=chat;lockLocal(view,shareChatUrl);
 view.on('closed',()=>{if(shareChat===chat)closeShareChat(chat.owner);});view.once('ready-to-show',()=>{if(shareChat===chat)view.show();});void view.loadURL(shareChatUrl).catch(()=>closeShareChat(current.owner));
}
function sendChatSnapshot(current){if(shareChat?.owner===current.owner&&!shareChat.window.isDestroyed()&&current.chatSnapshot)shareChat.window.webContents.send('sharechat:snapshot',current.chatSnapshot);}

const shareInkUrl='classroom-client://shareink/index.html';
function sendShareControls(current){if(current?.controls&&!current.window.isDestroyed())current.window.webContents.send('sharebar:controls',{...current.controls,inkEnabled:Boolean(current.controls.inkEnabled&&sharedDisplayStillMatches(captureSources.get(current.owner)?.display,screen.getAllDisplays())),inkActive:Boolean(shareInk&&shareInk.owner===current.owner),remoteActive:Boolean(remoteManager?.isActive(current.owner)),remoteError:Boolean(current.remoteError),remotePermissionRequired:Boolean(current.remotePermissionRequired),remotePending:Boolean(current.remotePending),remoteRequestBusy:Boolean(current.remoteRequestBusy),remoteRequestError:Boolean(current.remoteRequestError)});}
function closeShareInk(owner){
 if(!shareInk||(owner&&shareInk.owner!==owner))return;
 const current=shareInk;shareInk=null;if(!current.window.isDestroyed())current.window.close();if(shareBar?.owner===current.owner)sendShareControls(shareBar);
}
function showShareInk(current){
 const binding=captureSources.get(current.owner)?.display;
 if(!current.controls?.inkEnabled||!sharedDisplayStillMatches(binding,screen.getAllDisplays())||!normalizeShareInk({points:[{x:0,y:0}]},binding))throw new Error('Drawing is unavailable for this screen');
 const overlay=new BrowserWindow({...binding.bounds,frame:false,transparent:true,hasShadow:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,show:false,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'shareink/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 overlay.setContentProtection?.(true);
 const item={window:overlay,owner:current.owner,sessionId:current.sessionId,binding};shareInk=item;lockLocal(overlay,shareInkUrl);
 overlay.on('closed',()=>{if(shareInk===item){shareInk=null;if(shareBar?.owner===item.owner)sendShareControls(shareBar);}});
 overlay.once('ready-to-show',()=>{if(shareInk===item){overlay.show();if(!current.window.isDestroyed())current.window.moveTop();if(shareSeats&&!shareSeats.window.isDestroyed())shareSeats.window.moveTop();sendShareControls(current);}});
 void overlay.loadURL(shareInkUrl).catch(()=>closeShareInk(current.owner));
}
function closeShareBar(owner) {
  if(!shareBar || (owner && shareBar.owner!==owner))return;
  if(remoteConsent?.owner===shareBar.owner)remoteConsent=undefined;
  remoteRequests?.clear(shareBar.owner);
  remoteManager?.stop(shareBar.owner,'sharing-ended');
  closeShareInk(shareBar.owner);
  closeShareChat(shareBar.owner);
  restoreSharedClassroom(shareBar);
  closeShareSeats(shareBar.owner);
  const bar=shareBar.window;shareBar=null;if(!bar.isDestroyed())bar.close();
}
function restoreSharedClassroom(current){if(current?.autoHidden&&!current.owner.isDestroyed()&&contextOf(current.owner)?.sessionId===current.sessionId){current.autoHidden=false;current.owner.show();current.owner.focus();}}
const shareSeatsUrl='classroom-client://shareseats/index.html';
function closeShareSeats(owner){
  if(!shareSeats||(owner&&shareSeats.owner!==owner))return;
  if(shareBar?.owner===shareSeats.owner)restoreSharedClassroom(shareBar);
  const current=shareSeats;shareSeats=null;if(current.timer)clearTimeout(current.timer);if(!current.window.isDestroyed())current.window.close();
}
function updateShareSeats(owner,rect){
  if(!shareBar||shareBar.owner!==owner)return;
  const [width,height]=owner.getContentSize();
  if(!rect||!['x','y','width','height'].every(key=>Number.isFinite(rect[key]))||rect.x<0||rect.y<0||rect.width<32||rect.height<24||rect.x+rect.width>width+1||rect.y+rect.height>height+1){closeShareSeats(owner);return;}
  const area=screen.getDisplayMatching(owner.getBounds()).workArea;
  const targetWidth=Math.min(960,area.width,Math.round(rect.width)),targetHeight=Math.max(48,Math.min(180,Math.round(rect.height*targetWidth/rect.width)));
  if(!shareSeats){
    const view=new BrowserWindow({x:Math.round(area.x+(area.width-targetWidth)/2),y:area.y+8,width:targetWidth,height:targetHeight,frame:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,show:false,backgroundColor:'#1c2430',webPreferences:{preload:path.join(__dirname,'shareseats/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
    view.setContentProtection?.(true);
    const current={owner,window:view,sessionId:contextOf(owner)?.sessionId,rect:null,timer:null,failures:0,width:targetWidth,height:targetHeight};shareSeats=current;lockLocal(view,shareSeatsUrl);
    view.on('closed',()=>{if(shareSeats===current){if(shareBar?.owner===owner)restoreSharedClassroom(shareBar);if(current.timer)clearTimeout(current.timer);shareSeats=null;}});
    view.once('ready-to-show',()=>{if(shareSeats===current)view.showInactive();});
    void view.loadURL(shareSeatsUrl).catch(()=>closeShareSeats(owner));
    const tick=async()=>{if(shareSeats!==current||owner.isDestroyed()||view.isDestroyed()||contextOf(owner)?.sessionId!==current.sessionId)return;
      try{if(current.rect){const image=await owner.webContents.capturePage(current.rect,{stayHidden:true});if(image.isEmpty())throw new Error('Empty frame');if(shareSeats===current&&!view.isDestroyed()){const width=seatFrameWidth(image.getSize().width,current.width,screen.getDisplayMatching(view.getBounds()).scaleFactor);const frame=width<image.getSize().width?image.resize({width,quality:'best'}):image;view.webContents.send('shareseats:frame',frame.toJPEG(86).toString('base64'));current.failures=0;}}}catch{if(++current.failures>=8){closeShareSeats(owner);return;}}
      if(shareSeats===current)current.timer=setTimeout(tick,100);
    };void tick();
  }
  if(shareSeats.width!==targetWidth||shareSeats.height!==targetHeight){const bounds=shareSeats.window.getBounds();shareSeats.window.setBounds({x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-targetWidth)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-targetHeight)),width:targetWidth,height:targetHeight});shareSeats.width=targetWidth;shareSeats.height=targetHeight;}
  shareSeats.rect={x:Math.floor(rect.x),y:Math.floor(rect.y),width:Math.floor(rect.width),height:Math.floor(rect.height)};
}
function showShareBar(owner) {
  const context=contextOf(owner);if(!context)return;
  if(shareBar?.owner===owner&&!shareBar.window.isDestroyed())return;
  closeShareBar();
  const area=screen.getDisplayMatching(owner.getBounds()).workArea,width=Math.min(850,area.width),height=56;
  const bar=new BrowserWindow({x:Math.round(area.x+(area.width-width)/2),y:area.y+12,width,height,frame:false,transparent:true,resizable:false,skipTaskbar:true,alwaysOnTop:true,show:false,backgroundColor:'#00000000',...(process.platform==='darwin'?{vibrancy:'under-window',visualEffectState:'active'}:{}),
    webPreferences:{preload:path.join(__dirname,'sharebar/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  bar.setContentProtection?.(true);
  const current={window:bar,owner,sessionId:context.sessionId,controls:null,autoHidden:false,hiddenOnce:false};shareBar=current;lockLocal(bar,shareBarUrl);
  bar.once('ready-to-show',()=>{if(shareBar===current&&!owner.isDestroyed()&&contextOf(owner)?.sessionId===current.sessionId){sendShareControls(current);bar.showInactive();}});
  bar.on('closed',()=>{if(shareBar===current){if(remoteConsent?.owner===owner)remoteConsent=undefined;remoteRequests?.clear(owner);remoteManager?.stop(owner,'sharing-ended');closeShareInk(owner);closeShareChat(owner);restoreSharedClassroom(current);closeShareSeats(owner);shareBar=null;}});void bar.loadURL(shareBarUrl).catch(()=>{if(shareBar===current)closeShareBar(owner);});
}
function currentCapture(pending) {
  return Boolean(pending && capture===pending && !pending.owner.isDestroyed() && !pending.picker.isDestroyed() && pending.frame===pending.owner.webContents.mainFrame && trustedMediaFrame(pending.frame?.url,base));
}
async function startCapture(request,callback) {
  const owner=[...webWindows].find(window=>request.frame===window.webContents.mainFrame && trustedMediaFrame(request.frame?.url,base));
  if(!owner||!request.userGesture||!request.videoRequested){callback({});return;}
  cancelCapture();
  const picker=new BrowserWindow({parent:owner,modal:true,width:760,height:620,minWidth:600,minHeight:430,title:'选择共享窗口',backgroundColor:'#f5f5f7',
    webPreferences:{preload:path.join(__dirname,'capture/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  let settled=false;
  const pending={owner,picker,frame:request.frame,request,ids:new Set(),finish:streams=>{if(settled)return;settled=true;if(capture===pending)capture=null;try{callback(streams);}finally{if(!picker.isDestroyed())picker.close();}}};
  capture=pending;lockLocal(picker,CAPTURE_URL);picker.on('closed',()=>pending.finish({}));void picker.loadURL(CAPTURE_URL).catch(()=>pending.finish({}));
}
function installMediaPolicy(ses) {
  const allowed=(contents,url)=>[...webWindows].some(window=>!window.isDestroyed()&&window.webContents===contents&&trustedMediaFrame(window.webContents.getURL(),base)&&!classroomConflict(window.webContents.getURL(),window)&&trustedMediaFrame(url,base));
  const deviceCheck=(contents,url)=>{const grant=deviceChecks.get(contents);return !!grant&&Date.now()<grant.expires&&contents===homeWindow?.webContents&&contents.getURL()===grant.url&&url===grant.url;};
  ses.setPermissionCheckHandler((contents,permission,origin,details)=>{
    if(details.isMainFrame===false||!['media','display-capture','fullscreen','speaker-selection'].includes(permission))return false;
    try{const url=details.requestingUrl||contents?.getURL();return new URL(origin).origin===base&&(allowed(contents,url)||(permission==='media'&&deviceCheck(contents,url)));}catch{return false;}
  });
  ses.setPermissionRequestHandler((contents,permission,callback,details)=>{
    const checking=permission==='media'&&deviceCheck(contents,details.requestingUrl),grant=checking?deviceChecks.get(contents):null;
    if(details.isMainFrame===false||(!allowed(contents,details.requestingUrl)&&!checking)){callback(false);return;}
    if(checking){deviceChecks.delete(contents);if(!details.mediaTypes?.length||details.mediaTypes.some(type=>type!==grant.kind)){callback(false);return;}}
    if(['fullscreen','display-capture','speaker-selection'].includes(permission)){callback(true);return;}
    if(permission!=='media'){callback(false);return;}
    void(async()=>{try{
      const types=details.mediaTypes||[];
      if(process.platform==='darwin')for(const type of types){const kind=type==='video'?'camera':type==='audio'?'microphone':null;if(kind&&!await systemPreferences.askForMediaAccess(kind)){callback(false);return;}}
      callback(allowed(contents,details.requestingUrl)||(checking&&contents===homeWindow?.webContents&&contents.getURL()===grant.url));
    }catch{callback(false);}})();
  });
  // Keep source selection in the trusted picker, with an explicit user choice
  // and thumbnails. The experimental OS picker bypasses this handler.
  ses.setDisplayMediaRequestHandler((request,callback)=>{let settled=false;const respond=streams=>{if(settled)return;settled=true;callback(streams);};void startCapture(request,respond).catch(()=>respond({}));});
}
if(app.requestSingleInstanceLock()){
app.on('second-instance',()=>{void app.whenReady().then(focusHome);});
app.whenReady().then(()=>{
  if(process.platform==='darwin')app.dock?.setIcon?.(appIcon);
  app.setAccessibilitySupportEnabled(true);
  const ses=session.defaultSession;api=createApiClient({session:ses,base});installMediaPolicy(ses);
  const confirmRemote=async(owner,teacherId)=>{
      const cookies=await ses.cookies.get({url:base,name:'NEXT_LOCALE'}).catch(()=>[]),locale=(cookies[0]?.value||app.getLocale()).toLowerCase();
      const copy=locale.startsWith('zh-tw')?['允許老師控制共享螢幕？','老師可以操作滑鼠和鍵盤。你可以隨時停止控制。','允許控制','拒絕']:locale.startsWith('zh')?['允许老师控制共享屏幕？','老师可以操作鼠标和键盘。你可以随时停止控制。','允许控制','拒绝']:locale.startsWith('vi')?['Cho phép giáo viên điều khiển màn hình?','Giáo viên có thể dùng chuột và bàn phím. Bạn có thể dừng bất cứ lúc nào.','Cho phép','Từ chối']:['Allow the teacher to control your shared screen?','The teacher can use your mouse and keyboard. You can stop control at any time.','Allow control','Decline'];
      const parent=shareBar?.owner===owner&&!shareBar.window.isDestroyed()?shareBar.window:owner;
      const result=await dialog.showMessageBox(parent,{type:'question',message:copy[0],detail:`${teacherId.replace(/[\x00-\x1f]/g,'').slice(0,80)}\n${copy[1]}`,buttons:[copy[2],copy[3]],defaultId:1,cancelId:1,noLink:true});return result.response===0;
  };
  const teacherPointer=createTeacherPointer({BrowserWindow,url:'classroom-client://teacher-pointer/index.html',preload:path.join(__dirname,'teacher-pointer','preload.cjs')});
  remoteManager=createRemoteControlManager({
    getContext:contextOf,
    getSource:owner=>shareBar?.owner===owner?captureSources.get(owner):null,
    getDisplays:()=>screen.getAllDisplays(),
    readLease:clientId=>createReceiverLeaseReader({session:ses,base,clientId}),
    executable:nativeInputPath,
    startReceiver:input=>process.platform==='win32'?startWindowsRemoteReceiver({...input,getPhysicalBounds:display=>screen.dipToScreenRect(null,display.bounds)}):startMacRemoteReceiver(input),
    markReady:async({sessionId,clientId,grantId},signal)=>{const result=await ses.fetch(new URL(`/api/courses/${encodeURIComponent(sessionId)}/classroom/remote-control`,base).toString(),{method:'POST',credentials:'include',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'receiver-ready',clientId,grantId}),signal:AbortSignal.any([signal,AbortSignal.timeout(3000)])});if(!result.ok)throw Error('Readiness unavailable');},
    confirm:async(owner,teacherId,grantId,source)=>{const consent=remoteConsent;remoteConsent=undefined;if(consent&&consent.owner===owner&&consent.teacherId===teacherId&&consent.grantId===grantId&&consent.source===source&&consent.expires>Date.now())return true;return confirmRemote(owner,teacherId);},
    revoke:async({sessionId,clientId,grantId})=>{const result=await ses.fetch(new URL(`/api/courses/${encodeURIComponent(sessionId)}/classroom/remote-control`,base).toString(),{method:'POST',credentials:'include',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'stop',clientId,grantId}),signal:AbortSignal.timeout(3000)});if(!result.ok)throw Error('Revocation unavailable');},
    onPointer:(display,event)=>teacherPointer.show(display,event),
    onChange:(owner,state)=>{if(!state.active)teacherPointer.close();try{if(!owner.isDestroyed())owner.webContents.send('client:remote-state',state);}catch{/* The classroom may have closed while revocation was in flight. */}if(shareBar?.owner===owner){shareBar.remoteError=state.reason==='revoke-failed';if(state.reason==='permission-required')shareBar.remotePermissionRequired=true;else if(state.active)shareBar.remotePermissionRequired=false;sendShareControls(shareBar);}},
  });
  remoteRequests=createRemoteRequestManager({getContext:contextOf,getSource:owner=>shareBar?.owner===owner?captureSources.get(owner):null,getDisplays:()=>screen.getAllDisplays(),client:createRemoteRequestClient({session:ses,base}),confirm:confirmRemote,onChange:(owner,state)=>{if(state.decision==='granted'&&state.teacherId)remoteConsent={owner,grantId:state.grantId,teacherId:state.teacherId,source:captureSources.get(owner),expires:Date.now()+60000};try{if(!owner.isDestroyed())owner.webContents.send('client:remote-request-state',state);}catch{/* The classroom may have closed. */}if(shareBar?.owner===owner){shareBar.remotePending=Boolean(state.pending);shareBar.remoteRequestBusy=Boolean(state.busy);shareBar.remoteRequestError=Boolean(state.error);sendShareControls(shareBar);}}});
  const assets=new Map();
  for(const file of ['index.html','workspace.js','workspace.css'])assets.set('app/'+file,path.join(__dirname,'workspace',file));
  for(const file of ['index.html','home.js','home.css','model.js'])assets.set('home/'+file,path.join(__dirname,'home',file));
  for(const file of ['index.html','capture.js','capture.css'])assets.set('capture/'+file,path.join(__dirname,'capture',file));
  for(const file of ['index.html','sharebar.js','sharebar.css'])assets.set('sharebar/'+file,path.join(__dirname,'sharebar',file));
  for(const file of ['index.html','shareseats.js','shareseats.css'])assets.set('shareseats/'+file,path.join(__dirname,'shareseats',file));
  for(const file of ['index.html','chat.js','chat.css'])assets.set('sharechat/'+file,path.join(__dirname,'sharechat',file));
  for(const file of ['index.html','entry.js','entry.css'])assets.set('entry/'+file,path.join(__dirname,'entry',file));
  for(const file of ['index.html','connection.js','connection.css'])assets.set('connection/'+file,path.join(__dirname,'connection',file));
  assets.set('connection/app-icon.png',appIcon);
  for(const file of ['index.html','shareink.js','shareink.css'])assets.set('shareink/'+file,path.join(__dirname,'shareink',file));
  for(const file of ['index.html','pointer.js','pointer.css'])assets.set('teacher-pointer/'+file,path.join(__dirname,'teacher-pointer',file));
  const checkSharedDisplay=()=>{if(shareInk&&!sharedDisplayStillMatches(shareInk.binding,screen.getAllDisplays()))closeShareInk(shareInk.owner);remoteRequests?.recheck();remoteManager?.recheck();sendShareControls(shareBar);};
  for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,checkSharedDisplay);
  assets.set('home/design.css',path.join(__dirname,'../design/classin-v5/style.css'));
  assets.set('home/time.js',path.join(__dirname,'../design/classin-v5/time.js'));
  for(const file of ['ocean.png','canyon.png','forest.png'])assets.set('home/assets/'+file,path.join(__dirname,'../design/classin-v5/assets',file));
  protocol.handle('classroom-client',async request=>{
    const url=new URL(request.url),file=assets.get(url.hostname+url.pathname);
    if(!file||url.username||url.password||request.method!=='GET')return new Response('Not found',{status:404});
    const response=await net.fetch(pathToFileURL(file).toString()),headers=new Headers(response.headers);headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,headers});
  });
  let offlineCache={put:()=>false,get:()=>null,remove:()=>{},close:()=>{}};
  try{offlineCache=createOfflineCourseCache({directory:path.join(app.getPath('userData'),'offline-cache'),safeStorage,DatabaseSync:require('node:sqlite').DatabaseSync});}catch{/* A missing local cache must not prevent the online workspace from opening. */}
  const cacheApi=createApiClient({session:ses,base,timeoutMs:4000});
  const cachedCourses=createCachedCourseReader({api:cacheApi,session:ses,base,cache:offlineCache});
  app.once('before-quit',()=>offlineCache.close());
  const recoveryWindow=event=>{
    const owner=[...webWindows].find(window=>topFrame(event,window)&&connections.get(window)?.active);
    requireLocal(event,owner,CONNECTION_URL);return owner;
  };
  ipcMain.handle('connection:state',async event=>{const owner=recoveryWindow(event),cookies=await ses.cookies.get({url:base,name:'NEXT_LOCALE'}).catch(()=>[]);return{...connections.get(owner).snapshot(),locale:cookies[0]?.value||app.getLocale()};});
  ipcMain.handle('connection:retry',safeResult(async event=>{const owner=recoveryWindow(event);await connections.get(owner).retry();return{ok:true};}));
  ipcMain.handle('connection:home',safeResult(async event=>{const owner=recoveryWindow(event);if(owner===homeWindow)await connections.get(owner).home();else{focusHome();owner.close();}return{ok:true};}));
  ipcMain.handle('client:cached-courses',safeResult(async(event,userId)=>{const owner=requireClassroom(event);if(owner!==homeWindow||new URL(event.senderFrame.url).pathname!=='/')throw new Error('Unavailable');return cachedCourses(userId);}));
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
    const active=currentClassroom();if(active&&claimedContext(active)?.sessionId!==classroomContext(url,base).sessionId){focusExistingClassroom(active);return{ok:false,status:409,error:'请先退出当前课堂，再进入其他课节。'};}
    if(contextOf(owner)?.sessionId===classroomContext(url,base).sessionId)return{ok:true};
    openRemote(url,true);return{ok:true};
  }));
  ipcMain.handle('entry:locale',async event=>{const owner=[...webWindows].find(window=>roomEntries.get(window)?.window?.webContents===event.sender);requireLocal(event,roomEntries.get(owner)?.window,entryUrl);const cookies=await ses.cookies.get({url:base,name:'NEXT_LOCALE'});return cookies[0]?.value||app.getLocale();});
  ipcMain.handle('client:entry-ready',event=>{const owner=requireClassroom(event),entry=roomEntries.get(owner);if(entry&&contextOf(owner)?.sessionId===entry.sessionId)finishRoomEntry(owner,true);});
  ipcMain.handle('client:open-home',event=>{requireClassroom(event);focusHome();});
  ipcMain.handle('client:close-classroom',event=>{const owner=requireClassroom(event),context=contextOf(owner);if(owner===homeWindow||!context)throw new Error('Not a classroom window');focusHome();setTimeout(()=>{if(!owner.isDestroyed()&&contextOf(owner)?.sessionId===context.sessionId)owner.close();},0);});
  ipcMain.handle('client:sharing-state',(event,sharing)=>{const owner=requireClassroom(event);if(owner===homeWindow||!contextOf(owner)||typeof sharing!=='boolean')throw new Error('Invalid classroom sharing state');owner.webContents.backgroundThrottling=!sharing;if(sharing)showShareBar(owner);else{closeShareBar(owner);captureSources.delete(owner);}});
  ipcMain.handle('client:remote-pending',(event,input)=>{const owner=requireClassroom(event);if(!['darwin','win32'].includes(process.platform)||owner===homeWindow||!contextOf(owner))return false;return remoteRequests.set(owner,input);});
  ipcMain.handle('client:remote-start',async(event,input)=>{const owner=requireClassroom(event);if(!['darwin','win32'].includes(process.platform)||owner===homeWindow||!contextOf(owner)||!input||typeof input!=='object'||Array.isArray(input))return false;return remoteManager.start(owner,input);});
  ipcMain.handle('client:remote-stop',event=>{const owner=requireClassroom(event);return remoteManager.stop(owner,'student-stop');});
  ipcMain.handle('client:remote-input',(event,packet)=>{const owner=requireClassroom(event);return remoteManager.receive(owner,packet);});
  ipcMain.handle('client:sharing-controls',(event,controls)=>{
    const owner=requireClassroom(event),current=shareBar,keys=['microphoneOn','cameraOn','microphoneEnabled','cameraEnabled','membersEnabled'];
    if(!current||current.owner!==owner||contextOf(owner)?.sessionId!==current.sessionId||!controls||typeof controls!=='object'||keys.some(key=>typeof controls[key]!=='boolean')||(controls.inkEnabled!==undefined&&typeof controls.inkEnabled!=='boolean'))return;
    current.controls={...Object.fromEntries(keys.map(key=>[key,controls[key]])),inkEnabled:Boolean(controls.inkEnabled)};if(!current.controls.inkEnabled)closeShareInk(owner);sendShareControls(current);
  });
  ipcMain.handle('client:sharing-seats',(event,rect)=>{const owner=requireClassroom(event);if(owner===homeWindow||!contextOf(owner))throw new Error('Not a classroom window');updateShareSeats(owner,rect);});
  ipcMain.handle('client:screen-ink-failure',event=>{const owner=requireClassroom(event),bar=shareBar;if(bar?.owner===owner&&contextOf(owner)?.sessionId===bar.sessionId&&!bar.window.isDestroyed())bar.window.webContents.send('sharebar:ink-failure');});
  ipcMain.handle('shareseats:ready',event=>{
    const seats=shareSeats,bar=shareBar;requireLocal(event,seats?.window,shareSeatsUrl);
    if(!seats||!bar||bar.owner!==seats.owner||bar.hiddenOnce||seats.owner.isDestroyed()||contextOf(seats.owner)?.sessionId!==seats.sessionId)return;
    const source=captureSources.get(seats.owner);if(!source||source.id===seats.owner.getMediaSourceId()||bar.window.isDestroyed()||!bar.window.isVisible())return;
    bar.hiddenOnce=true;bar.autoHidden=true;seats.owner.hide();
  });
  ipcMain.handle('shareseats:locale',async event=>{requireLocal(event,shareSeats?.window,shareSeatsUrl);const cookies=await ses.cookies.get({url:base,name:'NEXT_LOCALE'});return cookies[0]?.value||app.getLocale();});
  ipcMain.handle('shareseats:members',event=>{
    const seats=shareSeats,bar=shareBar;requireLocal(event,seats?.window,shareSeatsUrl);
    if(!seats||!bar||bar.owner!==seats.owner||seats.owner.isDestroyed()||contextOf(seats.owner)?.sessionId!==seats.sessionId)throw new Error('Classroom unavailable');
    closeShareInk(seats.owner);bar.autoHidden=false;seats.owner.show();seats.owner.focus();if(bar.controls?.membersEnabled)seats.owner.webContents.send('client:sharing-command','members');
  });
  ipcMain.handle('client:sharing-chat-snapshot',(event,input)=>{
    const owner=requireClassroom(event),current=shareBar;if(!current||current.owner!==owner||contextOf(owner)?.sessionId!==current.sessionId||!input||typeof input.disabled!=='boolean'||!Array.isArray(input.messages))return;
    const channels=[{scope:'classroom',spaceId:null}];if(Array.isArray(input.channels))for(const channel of input.channels){if(channel?.scope==='staff'&&!channels.some(row=>row.scope==='staff'))channels.push({scope:'staff',spaceId:null});if(channel?.scope==='room'&&typeof channel.spaceId==='string'&&channel.spaceId.length>0&&channel.spaceId.length<=200&&!channels.some(row=>row.scope==='room'))channels.push({scope:'room',spaceId:channel.spaceId});}
    current.chatSnapshot={disabled:input.disabled,translationState:['off','pending','failed','unavailable','ready'].includes(input.translationState)?input.translationState:'off',channels,messages:input.messages.slice(-300).filter(item=>item&&typeof item.name==='string'&&typeof item.content==='string'&&['text','system','image'].includes(item.kind)&&channels.some(channel=>channel.scope===(item.scope||'classroom'))).map(item=>({id:typeof item.id==='string'?item.id.slice(0,200):'',name:item.name.slice(0,100),content:item.content.slice(0,item.kind==='image'?16000:2400),translation:item.kind==='text'&&typeof item.translation==='string'?item.translation.slice(0,2400):null,kind:item.kind,scope:item.scope||'classroom'}))};sendChatSnapshot(current);
  });
  ipcMain.handle('client:sharing-chat-result',(event,id,ok)=>{const owner=requireClassroom(event),chat=shareChat;if(chat?.owner!==owner||typeof id!=='string'||typeof ok!=='boolean')return;chat.pending.get(id)?.(ok);});
  ipcMain.handle('client:sharing-chat-image-result',(event,id,data)=>{const owner=requireClassroom(event),chat=shareChat;if(chat?.owner!==owner||typeof id!=='string')return;if(data!==null&&(typeof data!=='string'||data.length>7_000_000||!/^data:image\/webp;base64,[A-Za-z0-9+/]*={0,2}$/.test(data)))data=null;chat.images.get(id)?.(data);});
  ipcMain.handle('sharechat:locale',async event=>{requireLocal(event,shareChat?.window,shareChatUrl);const cookies=await ses.cookies.get({url:base,name:'NEXT_LOCALE'});return cookies[0]?.value||app.getLocale();});
  ipcMain.handle('sharechat:close',event=>{requireLocal(event,shareChat?.window,shareChatUrl);closeShareChat();});
  ipcMain.handle('sharechat:ready',event=>{requireLocal(event,shareChat?.window,shareChatUrl);if(shareBar)sendChatSnapshot(shareBar);});
  ipcMain.handle('sharechat:translation-retry',event=>{requireLocal(event,shareChat?.window,shareChatUrl);const chat=shareChat,current=shareBar;if(!chat||!current||chat.owner!==current.owner||chat.owner.isDestroyed()||contextOf(chat.owner)?.sessionId!==chat.sessionId||!['failed','unavailable'].includes(current.chatSnapshot?.translationState)||Date.now()-(chat.lastTranslationRetry||0)<1000)return false;chat.lastTranslationRetry=Date.now();chat.owner.webContents.send('client:sharing-chat-translation-retry');return true;});
  ipcMain.handle('sharechat:image',(event,messageId)=>{
    const chat=shareChat,current=shareBar;requireLocal(event,chat?.window,shareChatUrl);
    const allowed=()=>chat&&current&&shareChat===chat&&shareBar===current&&chat.owner===current.owner&&!chat.owner.isDestroyed()&&contextOf(chat.owner)?.sessionId===chat.sessionId&&current.chatSnapshot?.messages.some(item=>item.kind==='image'&&item.id===messageId);
    if(typeof messageId!=='string'||!messageId||!allowed()||chat.images.size>=4)return null;
    const id=require('node:crypto').randomUUID();return new Promise(resolve=>{const timer=setTimeout(()=>finish(null),15000);const finish=data=>{clearTimeout(timer);chat.images.delete(id);resolve(allowed()?data:null);};chat.images.set(id,finish);chat.owner.webContents.send('client:sharing-chat-image',{id,messageId});});
  });
  ipcMain.handle('sharechat:send',(event,text,scope='classroom')=>{
    const chat=shareChat,current=shareBar;requireLocal(event,chat?.window,shareChatUrl);
    const channel=current?.chatSnapshot?.channels.find(value=>value.scope===scope);
    if(!chat||!current||chat.owner!==current.owner||chat.owner.isDestroyed()||contextOf(chat.owner)?.sessionId!==chat.sessionId||current.chatSnapshot?.disabled!==false||!channel||typeof text!=='string'||!text.trim()||Array.from(text).length>1200||chat.pending.size>=1)throw new Error('Chat unavailable');
    const content=text.trim(),uuid=require('node:crypto').randomUUID;
    const attempt=current.chatAttempt?.text===content&&current.chatAttempt.scope===scope&&current.chatAttempt.spaceId===channel.spaceId?current.chatAttempt:{text:content,scope,spaceId:channel.spaceId,clientMessageId:uuid()};
    current.chatAttempt=attempt;
    const id=uuid();return new Promise(resolve=>{const timer=setTimeout(()=>finish(false),20000);const finish=value=>{clearTimeout(timer);chat.pending.delete(id);if(value&&current.chatAttempt===attempt)current.chatAttempt=null;resolve(value);};chat.pending.set(id,finish);chat.owner.webContents.send('client:sharing-chat-send',{id,clientMessageId:attempt.clientMessageId,text:content,scope,spaceId:channel.spaceId});});
  });
  ipcMain.handle('sharebar:expanded',(event,expanded)=>{const current=shareBar;requireLocal(event,current?.window,shareBarUrl);if(typeof expanded!=='boolean'||current.owner.isDestroyed()||contextOf(current.owner)?.sessionId!==current.sessionId)throw new Error('Unavailable');const bounds=current.window.getBounds(),area=screen.getDisplayMatching(bounds).workArea,width=Math.min(expanded?850:268,area.width);current.window.setBounds({x:Math.max(area.x,Math.min(Math.round(bounds.x+(bounds.width-width)/2),area.x+area.width-width)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-bounds.height)),width,height:56});return true;});
  ipcMain.handle('sharebar:locale',async event=>{requireLocal(event,shareBar?.window,shareBarUrl);const cookies=await ses.cookies.get({url:base,name:'NEXT_LOCALE'});return cookies[0]?.value||app.getLocale();});
  ipcMain.handle('shareink:close',event=>{requireLocal(event,shareInk?.window,shareInkUrl);closeShareInk();});
  ipcMain.handle('shareink:stroke',(event,input)=>{
    const ink=shareInk,current=shareBar;requireLocal(event,ink?.window,shareInkUrl);
    if(!ink||!current||current.owner!==ink.owner||!current.controls?.inkEnabled||ink.owner.isDestroyed()||contextOf(ink.owner)?.sessionId!==ink.sessionId||!sharedDisplayStillMatches(ink.binding,screen.getAllDisplays())){closeShareInk();throw new Error('Sharing ended');}
    const stroke=normalizeShareInk(input,ink.binding);if(!stroke)throw new Error('Invalid stroke');
    ink.owner.webContents.send('client:screen-ink',stroke);
  });
  ipcMain.handle('sharebar:action',(event,action)=>{
    const current=shareBar;requireLocal(event,current?.window,shareBarUrl);
    if(!current||current.owner.isDestroyed()||contextOf(current.owner)?.sessionId!==current.sessionId||!['stop','show','settings','members','microphone','camera','ink','chat','remote-stop','remote-review','remote-permission'].includes(action))throw new Error('Classroom unavailable');
    if(action==='remote-permission'){
      if(process.platform!=='darwin'||!current.remotePermissionRequired)throw new Error('Permission settings unavailable');
      return (async()=>{
        const cookies=await ses.cookies.get({url:base,name:'NEXT_LOCALE'}).catch(()=>[]),locale=(cookies[0]?.value||app.getLocale()).toLowerCase();
        const copy=locale.startsWith('zh-tw')?['需要輔助使用權限','在系統設定中允許本課堂應用程式和 RemoteInput 控制電腦。完成後返回，請老師重新發起控制請求。','打開設定','稍後']:locale.startsWith('zh')?['需要辅助功能权限','在系统设置中允许本课堂应用和 RemoteInput 控制电脑。完成后返回，请老师重新发起控制请求。','打开设置','稍后']:locale.startsWith('vi')?['Cần quyền Trợ năng','Cho phép ứng dụng lớp học và RemoteInput điều khiển máy tính trong Cài đặt hệ thống. Sau đó quay lại và nhờ giáo viên yêu cầu lại.','Mở cài đặt','Để sau']:['Accessibility access required','Allow the classroom app and RemoteInput to control this computer in System Settings. Then return and ask your teacher to request control again.','Open settings','Later'];
        const helper=macRemoteHelperPath({isPackaged:app.isPackaged,resourcesPath:process.resourcesPath,appPath:app.getAppPath()});
        const choice=await dialog.showMessageBox(current.window,{type:'info',message:copy[0],detail:`${copy[1]}\n\nRemoteInput: ${helper}`,buttons:[copy[2],copy[3]],defaultId:0,cancelId:1,noLink:true});
        if(choice.response===0&&shareBar===current&&!current.owner.isDestroyed())await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      })();
    }
    if(action==='remote-review')return remoteRequests.review(current.owner);
    if(action==='remote-stop'){remoteManager.stop(current.owner,'student-stop');return;}
    if(action==='chat'){if(shareChat?.owner===current.owner)closeShareChat(current.owner);else openShareChat(current);return;}
    if(action==='ink'){if(shareInk)closeShareInk(current.owner);else showShareInk(current);return;}
    if((action==='microphone'||action==='camera'||action==='members')&&!current.controls?.[action+'Enabled'])throw new Error('Control unavailable');
    if(action==='show'||action==='settings'||action==='members'){closeShareInk(current.owner);current.autoHidden=false;current.owner.show();current.owner.focus();}
    if(action!=='show')current.owner.webContents.send('client:sharing-command',action);
  });
  ipcMain.handle('client:prepare-device-check',(event,kind)=>{const window=requireClassroom(event),url=new URL(event.senderFrame.url);if(window!==homeWindow||!['audio','video'].includes(kind)||!(url.pathname==='/'||/^\/courses\/[^/]+\/?$/.test(url.pathname)))throw new Error('Device check unavailable');deviceChecks.set(event.sender,{kind,url:url.toString(),expires:Date.now()+15000});});
  ipcMain.handle('client:cancel-device-check',event=>{if(requireClassroom(event)!==homeWindow)throw new Error('Device check unavailable');deviceChecks.delete(event.sender);});
  ipcMain.handle('client:open-workspace',event=>openWorkspace(requireClassroom(event)));
  ipcMain.handle('client:context',event=>{requireLocal(event,workspaceWindow,workspaceUrl);const context=contextOf(workspaceOwner);return{hasClassroom:Boolean(context),sessionId:context?.sessionId||'',preferredTab,navigationId:workspaceNavigation};});
  ipcMain.handle('client:focus-classroom',event=>{requireLocal(event,workspaceWindow,workspaceUrl);const window=workspaceOwner&&!workspaceOwner.isDestroyed()?workspaceOwner:currentClassroom();if(window){window.show();window.focus();}else focusHome();});
  ipcMain.handle('client:request',safeResult(async(event,operation,args)=>{
    requireLocal(event,workspaceWindow,workspaceUrl);const context=contextOf(workspaceOwner);
    if(args?.sessionId&&args.sessionId!==context?.sessionId)return{ok:false,status:409,error:'当前课堂已切换，请重新加载花名册。'};
    return api(operation,args,context);
  }));
  ipcMain.handle('capture:locale',async event=>{requireLocal(event,capture?.picker,CAPTURE_URL);const cookies=await ses.cookies.get({url:base,name:'NEXT_LOCALE'});return cookies[0]?.value||app.getLocale();});
  ipcMain.handle('capture:sources',async event=>{
    const pending=capture;requireLocal(event,pending?.picker,CAPTURE_URL);
    if(!currentCapture(pending))throw new Error('Classroom changed');
    const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:480,height:270}});
    if(!currentCapture(pending))throw new Error('Classroom changed');
    const visible=sources.filter(source=>source.id!==pending.picker.getMediaSourceId());pending.ids=new Set(visible.map(source=>source.id));return visible.map(source=>({id:source.id,name:source.name,kind:source.id.startsWith('screen:')?'screen':'window',thumbnailDataUrl:source.thumbnail.isEmpty()?'':source.thumbnail.toDataURL()}));
  });
  ipcMain.handle('capture:select',async(event,id)=>{
    const pending=capture;requireLocal(event,pending?.picker,CAPTURE_URL);
    if(!currentCapture(pending)||!pending.ids.has(id))throw new Error('Invalid capture source');
    const sources=await desktopCapturer.getSources({types:['screen','window']}),source=sources.find(source=>source.id===id);if(!source)throw new Error('Source closed');
    if(!currentCapture(pending)||!pending.ids.has(id))throw new Error('Classroom changed');
    captureSources.set(pending.owner,{id:source.id,display:bindSharedDisplay(source,screen.getAllDisplays())});remoteRequests?.recheck();remoteManager?.recheck();pending.finish({video:source,...(process.platform==='win32'&&pending.request.audioRequested?{audio:'loopback'}:{})});
  });
  ipcMain.handle('capture:cancel',event=>{requireLocal(event,capture?.picker,CAPTURE_URL);cancelCapture();});
  Menu.setApplicationMenu(Menu.buildFromTemplate([...(process.platform==='darwin'?[{role:'appMenu'}]:[]),{label:'课堂',submenu:[{label:'桌面工作台',accelerator:'CmdOrCtrl+1',click:focusHome},{label:'人员工作台',accelerator:'CmdOrCtrl+2',click:()=>openWorkspace()},{label:'返回课堂',accelerator:'CmdOrCtrl+3',click:()=>{const window=currentClassroom();if(window){window.show();window.focus();}}},{type:'separator'},{role:'reload'},{role:'togglefullscreen'}]},{role:'editMenu'},{role:'windowMenu'}]));
  createHome();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createHome();});
});
}else{app.quit();}
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
