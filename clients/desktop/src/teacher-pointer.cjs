'use strict';
/** Non-interactive visual indicator for verified remote input only. */
function createTeacherPointer({BrowserWindow,url,preload}){
 let window,timer,ready=false,pendingClick=false;
 const hide=()=>{clearTimeout(timer);timer=undefined;if(window&&!window.isDestroyed())window.hide();};
 const close=()=>{clearTimeout(timer);timer=undefined;ready=false;pendingClick=false;if(window&&!window.isDestroyed())window.close();window=undefined;};
 const show=(display,event)=>{
  const b=display?.bounds;
  if(!b||![b.x,b.y,b.width,b.height,event?.x,event?.y].every(Number.isFinite)||b.width<1||b.height<1||event.x<0||event.x>1||event.y<0||event.y>1)return;
  const x=Math.round(b.x+Math.min(b.width-1,event.x*b.width)),y=Math.round(b.y+Math.min(b.height-1,event.y*b.height));
  if(!window||window.isDestroyed()){
   window=new BrowserWindow({x,y,width:112,height:55,show:false,frame:false,transparent:true,hasShadow:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,resizable:false,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true}});
   window.setIgnoreMouseEvents(true,{forward:true});window.setAlwaysOnTop(true,'screen-saver');window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
   window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
   const created=window;void created.loadURL(url).then(()=>{if(window!==created||created.isDestroyed())return;ready=true;if(pendingClick){pendingClick=false;created.webContents.send('teacher-pointer:click');}}).catch(()=>{if(window===created)close();});
  }
  window.setPosition(x,y,false);window.showInactive();
  if(event.type==='button'&&event.down){if(ready)window.webContents.send('teacher-pointer:click');else pendingClick=true;}
  clearTimeout(timer);timer=setTimeout(hide,1500);timer.unref?.();
 };
 return {show,hide,close};
}
module.exports={createTeacherPointer};
