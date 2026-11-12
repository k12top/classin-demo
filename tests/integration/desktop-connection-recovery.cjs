if(!process.versions.electron){
 const http=require('node:http'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const root=path.resolve(__dirname,'../..'),reservation=http.createServer();
 reservation.listen(0,'127.0.0.1',()=>{const port=reservation.address().port;reservation.close(()=>{
  const executable=require(path.join(root,'clients/desktop/node_modules/electron'));
  const result=spawnSync(executable,[__filename,...process.argv.slice(2)],{stdio:'inherit',timeout:45000,env:{...process.env,CLASSIN_CONNECTION_TEST_BASE:`http://127.0.0.1:${port}`}});
  if(result.error)console.error(result.error.message);process.exitCode=result.status??1;
 });});
}else{
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'classin-connection-'));
app.setPath('userData',temp);app.on('window-all-closed',()=>{});
const output=path.join(root,'outputs/desktop-connection');fs.mkdirSync(output,{recursive:true});
let window,server;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(check,label){for(let attempt=0;attempt<180;attempt++){if(await check())return;await pause(50);}throw Error('Timed out: '+label);}
async function run(){
 const port=Number(new URL(process.env.CLASSROOM_WEB_URL).port);
 await app.whenReady();
 await session.defaultSession.cookies.set({url:process.env.CLASSROOM_WEB_URL,name:'NEXT_LOCALE',value:'en'});
 const connection='classroom-client://connection/index.html';
 await wait(()=>window&&window.webContents.getURL()===connection&&!window.webContents.isLoading(),'local recovery document');
 const evaluate=source=>window.webContents.executeJavaScript(source);
 await wait(()=>evaluate(`Boolean(window.classroomConnection && document.getElementById('retry')?.textContent)`),'isolated preload bridge');
 const snapshot=await evaluate(`window.classroomConnection.state()`);assert.equal(snapshot.reason,'network');assert.equal('target' in snapshot,false);
 for(const locale of ['zh-CN','zh-TW','en','vi'])for(const width of [1366,1024]){
  await session.defaultSession.cookies.set({url:process.env.CLASSROOM_WEB_URL,name:'NEXT_LOCALE',value:locale});
  window.setContentSize(width,768);await window.loadURL(connection);
  await wait(()=>evaluate(`document.documentElement.lang===${JSON.stringify(locale)}`),'localized recovery copy');
  await wait(()=>evaluate(`document.querySelector('main>img').complete&&document.querySelector('main>img').naturalWidth>0`),'packaged application icon');
  const metrics=await evaluate(`(()=>{const main=document.querySelector('main').getBoundingClientRect(),retry=document.getElementById('retry').getBoundingClientRect(),home=document.getElementById('home').getBoundingClientRect();return{width:innerWidth,height:innerHeight,bodyWidth:document.body.scrollWidth,bodyHeight:document.body.scrollHeight,main:{x:main.x,y:main.y,right:main.right,bottom:main.bottom},retry:{x:retry.x,y:retry.y,right:retry.right,bottom:retry.bottom},home:{x:home.x,y:home.y,right:home.right,bottom:home.bottom},font:getComputedStyle(document.body).fontSize,heading:getComputedStyle(document.querySelector('h1')).fontSize,bridgeMethods:Object.keys(window.classroomConnection)}})()`);
  assert.ok(metrics.bodyWidth<=metrics.width);assert.ok(metrics.bodyHeight<=metrics.height+1);
  assert.ok(metrics.main.x>=0&&metrics.main.right<=metrics.width&&metrics.main.bottom<=metrics.height);
  for(const key of ['retry','home'])assert.ok(metrics[key].x>=0&&metrics[key].right<=metrics.width&&metrics[key].bottom<=metrics.height);
  assert.equal(metrics.font,'13px');assert.equal(metrics.heading,'18px');assert.deepEqual(metrics.bridgeMethods,['state','retry','home']);
  await pause(60);fs.writeFileSync(path.join(output,`${process.argv.includes('--archive')?'archive-':''}${locale}-${width}.png`),(await window.webContents.capturePage()).toPNG());
 }
 let reply;const requested=[];
 server=http.createServer((req,res)=>{requested.push(req.url);reply=()=>{res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><title>Restored</title><h1 id="restored">Connection restored</h1>');};});
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
 await evaluate(`document.getElementById('retry').click()`);
 await wait(()=>Boolean(reply),'retry reaches original origin');
 reply();await wait(()=>window.webContents.getURL()===process.env.CLASSROOM_WEB_URL+'/'&&!window.webContents.isLoading(),'original page restored');
 assert.deepEqual(requested.filter(url=>url!=='/favicon.ico'),['/']);
 assert.equal(await evaluate(`Boolean(document.getElementById('restored'))`),true);
 assert.equal(await evaluate(`typeof window.classroomConnection`),'undefined');
 console.log(JSON.stringify({passed:true,source:process.argv.includes('--archive')?'archive':'working-tree',layouts:8,initialNetworkFailure:true,restoredThroughRealIpc:true,retryPath:'/',remotePageHasNoRecoveryBridge:true}));
}
async function finish(code){for(const item of BrowserWindow.getAllWindows())item.destroy();await new Promise(resolve=>server?server.close(resolve):resolve());fs.rmSync(temp,{recursive:true,force:true});app.exit(code);}
process.env.CLASSROOM_WEB_URL=process.env.CLASSIN_CONNECTION_TEST_BASE;
app.on('browser-window-created',(_event,created)=>{if(!window){window=created;created.hide();}});
const entry=process.argv.includes('--archive')?path.join(root,'clients/desktop/dist/mac-arm64/翔宇文淑课堂.app/Contents/Resources/app.asar/src/main.cjs'):path.join(root,'clients/desktop/src/main.cjs');
require(entry);
run().then(()=>finish(0),error=>{console.error(error);void finish(1);});
}
