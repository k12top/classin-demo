/* eslint-disable @typescript-eslint/no-require-imports -- isolated Electron drawing surface */
const {app,BrowserWindow,ipcMain,protocol,net}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-share-ink-'));app.setPath('userData',temp);app.on('window-all-closed',()=>{});
protocol.registerSchemesAsPrivileged([{scheme:'classroom-client',privileges:{standard:true,secure:true}}]);let win,received,closed=false;
async function main(){
 await app.whenReady();const root=path.resolve(__dirname,'../../clients/desktop/src/shareink');
 protocol.handle('classroom-client',request=>{const url=new URL(request.url),name=url.pathname.slice(1);if(url.hostname!=='shareink'||!['index.html','shareink.js','shareink.css'].includes(name))return new Response('Not found',{status:404});return net.fetch(pathToFileURL(path.join(root,name)).toString());});
 ipcMain.handle('shareink:stroke',(_event,stroke)=>{received=stroke});ipcMain.handle('shareink:close',()=>{closed=true});
 win=new BrowserWindow({width:480,height:300,transparent:true,frame:false,show:true,webPreferences:{preload:path.join(root,'preload.cjs'),sandbox:true,contextIsolation:true}});await win.loadURL('classroom-client://shareink/index.html');
 const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Timed out waiting for drawing input');};
 await wait(()=>win.webContents.executeJavaScript('Boolean(window.shareInk)'));
 win.webContents.debugger.attach('1.3');const send=(type,x,y,buttons)=>win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons,clickCount:1});
 await send('mousePressed',48,30,1);await send('mouseMoved',240,150,1);await send('mouseReleased',240,150,0);await wait(()=>received);
 assert.ok(received.points.length>=2);assert.ok(Math.abs(received.points[0].x-.1)<.02);assert.ok(Math.abs(received.points.at(-1).y-.5)<.02);
 await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait(()=>closed);
 console.log('Transparent drawing window forwards normalized pointer strokes and Escape');
}
main().then(()=>{win?.destroy();fs.rmSync(temp,{recursive:true,force:true});app.exit(0)}).catch(error=>{console.error(error);win?.destroy();fs.rmSync(temp,{recursive:true,force:true});app.exit(1)});
