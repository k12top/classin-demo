/* Isolated Electron renderer; no classroom account, RTC or system input. */
const {app,BrowserWindow}=require('electron'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../../clients/desktop/src/teacher-pointer');
let win;
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:112,height:55,transparent:true,frame:false,webPreferences:{preload:path.join(base,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 await win.loadFile(path.join(base,'index.html'));
 assert.equal(await win.webContents.executeJavaScript("document.querySelector('#label').textContent.length>0"),true);
 win.webContents.send('teacher-pointer:click');
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(await win.webContents.executeJavaScript("document.querySelector('.click-feedback').getAnimations().length"),1);
 win.webContents.send('teacher-pointer:click');
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(await win.webContents.executeJavaScript("document.querySelector('.click-feedback').getAnimations().length"),1,'repeated clicks replace the previous feedback');
 const img=await win.webContents.capturePage();await require('node:fs/promises').writeFile('/tmp/classin-teacher-pointer-click.png',img.toPNG());
 console.log('PASS teacher pointer local renderer: isolated preload, click feedback and repeated clicks');win.destroy();app.quit();
}).catch(error=>{console.error(error);win?.destroy();app.exit(1)});
