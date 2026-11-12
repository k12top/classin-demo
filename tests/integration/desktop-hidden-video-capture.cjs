/* eslint-disable @typescript-eslint/no-require-imports -- isolated native video-capture probe */
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'classroom-hidden-video-'));app.setPath('userData',temp);app.on('window-all-closed',()=>{});
let win;
async function main(){
 await app.whenReady();
 win=new BrowserWindow({width:300,height:200,show:false,webPreferences:{backgroundThrottling:false}});
 await win.loadURL('data:text/html,'+encodeURIComponent('<!doctype html><style>html,body{margin:0;background:black}video{width:200px;height:120px}</style><video autoplay muted playsinline></video>'));
 await win.webContents.executeJavaScript(`(()=>{const canvas=document.createElement('canvas');canvas.width=200;canvas.height=120;const ctx=canvas.getContext('2d');window.setColour=value=>{ctx.fillStyle=value;ctx.fillRect(0,0,200,120)};window.setColour('rgb(255,0,0)');const video=document.querySelector('video');video.srcObject=canvas.captureStream(10);video.play()})()`);
 win.show();await new Promise(resolve=>setTimeout(resolve,400));win.hide();
 const grab=async()=>{await new Promise(resolve=>setTimeout(resolve,350));return (await win.webContents.capturePage({x:0,y:0,width:180,height:100},{stayHidden:true})).toBitmap()};
 const red=await grab();await win.webContents.executeJavaScript(`window.setColour('rgb(0,0,255)')`);const blue=await grab();
 const pixel=buffer=>{const i=(20*180+20)*4;return [buffer[i],buffer[i+1],buffer[i+2]]};
 const a=pixel(red),b=pixel(blue);assert.ok(a[2]>a[0]+80,`first frame is red: ${a}`);assert.ok(b[0]>b[2]+80,`second frame is blue: ${b}`);
 assert.equal(win.isVisible(),false);console.log('Hidden classroom renderer produces changing local video frames');
}
main().then(()=>{win?.destroy();fs.rmSync(temp,{recursive:true,force:true});app.exit(0)}).catch(error=>{console.error(error);win?.destroy();fs.rmSync(temp,{recursive:true,force:true});app.exit(1)});
