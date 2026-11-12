/* eslint-disable @typescript-eslint/no-require-imports -- isolated desktop capture probe */
const {app,BrowserWindow,desktopCapturer,screen,session,systemPreferences}=require('electron');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
if(process.env.CLASSROOM_CAPTURE_INK_TEST!=='1')throw Error('Set CLASSROOM_CAPTURE_INK_TEST=1 to capture the isolated test windows');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-capture-ink-'));app.setPath('userData',temp);app.on('window-all-closed',()=>{});
let server,background,overlay,reader;
async function main(){
 await app.whenReady();const display=screen.getPrimaryDisplay(),source=(await desktopCapturer.getSources({types:['screen']})).find(item=>item.display_id===String(display.id));
 if(!source)throw Error('Could not map capture source to the primary display');
 const area=display.workArea,x=Math.round(area.x+Math.min(200,area.width/4)),y=Math.round(area.y+Math.min(200,area.height/4)),width=160,height=120;
 if(x+width>area.x+area.width||y+height>area.y+area.height)throw Error('Display is too small for the probe');
 background=new BrowserWindow({x,y,width,height,frame:false,resizable:false,alwaysOnTop:true,show:false,backgroundColor:'#00c000'});await background.loadURL('data:text/html,<style>html,body{margin:0;background:rgb(0,192,0)}</style>');background.show();
 overlay=new BrowserWindow({x,y,width,height,frame:false,transparent:true,hasShadow:false,resizable:false,skipTaskbar:true,alwaysOnTop:true,show:false,backgroundColor:'#00000000'});overlay.setContentProtection(true);await overlay.loadURL('data:text/html,<style>html,body{margin:0;background:transparent}div{position:absolute;inset:0;background:rgb(240,0,0)}</style><div></div>');overlay.show();overlay.moveTop();
 const overlayImage=await overlay.webContents.capturePage(),overlaySize=overlayImage.getSize(),bitmap=overlayImage.toBitmap(),offset=(Math.floor(overlaySize.height/2)*overlaySize.width+Math.floor(overlaySize.width/2))*4;
 if(bitmap[offset+2]<180||bitmap[offset+1]>80)throw Error('Overlay did not render the red test surface');
 server=http.createServer((_req,res)=>{res.end('<!doctype html><video autoplay muted playsinline></video>')});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const permissions=[];session.defaultSession.setPermissionCheckHandler((_contents,permission)=>{permissions.push(permission);return ['display-capture','media'].includes(permission)});
 session.defaultSession.setPermissionRequestHandler((_contents,permission,callback)=>{permissions.push(permission);callback(['display-capture','media'].includes(permission))});
 session.defaultSession.setDisplayMediaRequestHandler((_request,callback)=>callback({video:source}));
 reader=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});await reader.loadURL(`http://127.0.0.1:${server.address().port}/`);
 await reader.webContents.executeJavaScript(`navigator.mediaDevices.getDisplayMedia({video:true,audio:false}).then(stream=>{window.probeStream=stream;const video=document.querySelector('video');video.srcObject=stream;video.play();video.onloadeddata=()=>document.body.dataset.ready='yes'}).catch(error=>document.body.dataset.ready='error:'+error.name);true`,true);
 for(let i=0;i<120;i++){const state=await reader.webContents.executeJavaScript('document.body.dataset.ready||""');if(state==='yes')break;if(state.startsWith('error:'))throw Error(`Display capture ${state}; screen permission ${process.platform==='darwin'?systemPreferences.getMediaAccessStatus('screen'):'unknown'}; requested ${permissions.join(',')}`);if(i===119)throw Error('Display capture timed out');await new Promise(resolve=>setTimeout(resolve,100));}
 await new Promise(resolve=>setTimeout(resolve,500));
 const pixel=await reader.webContents.executeJavaScript(`(()=>{const video=document.querySelector('video'),canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);const x=Math.floor(${(x+width/2-display.bounds.x)/display.bounds.width}*canvas.width),y=Math.floor(${(y+height/2-display.bounds.y)/display.bounds.height}*canvas.height);return Array.from(ctx.getImageData(x,y,1,1).data)})()`);
 if(pixel[0]>180&&pixel[1]<80)console.log('Protected transparent overlay is visible in macOS screen capture');
 else if(pixel[1]>140&&pixel[0]<80)console.log('Protected transparent overlay is excluded from screen capture');
 else throw Error('Capture probe returned neither test color');
 await reader.webContents.executeJavaScript('window.probeStream.getTracks().forEach(track=>track.stop())');
}
main().then(()=>0).catch(error=>{console.error(error.message);return 1}).then(code=>{reader?.destroy();overlay?.destroy();background?.destroy();server?.close();fs.rmSync(temp,{recursive:true,force:true});app.exit(code)});
