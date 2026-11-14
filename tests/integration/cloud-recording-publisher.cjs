// Explicitly opted-in loopback fixture. Real RTC and STT; synthetic AV, private Electron session.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'outputs/cloud-recording-live');
if(process.env.CLASSIN_TEST_CLOUD_RECORDING!=='1')throw Error('Requires explicit cloud verification opt-in');
const profile=require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(),'cloud-publisher-'));
app.setPath('userData',profile);
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
let win,server,heartbeat;
app.whenReady().then(async()=>{
  const f=JSON.parse(await fs.readFile(path.join(output,'fixture.json'),'utf8'));
  if(Date.now()>f.expiresAt)throw Error('Expired fixture');
  const h=await require('./cloud-recording-access.cjs').harness();
  const clientId=`cloud-fixture-${f.runId}`;
  const bootstrap=await h.request('teacher','/api/classroom/session','POST',{sessionId:f.sessionId,clientId,deviceEntryMode:'replace'});
  const whiteboard=await h.request('teacher','/api/classroom/session/whiteboard-credential','POST',{sessionId:f.sessionId,clientId,deviceEntryMode:'replace'});
  if(!whiteboard.whiteboard?.enabled||!whiteboard.whiteboard?.writable)throw Error('Teacher whiteboard must be writable');
  heartbeat=setInterval(()=>void h.request('teacher',`/api/courses/${f.sessionId}/classroom/actions`,'POST',{clientId,action:{type:'heartbeat'}}).catch(()=>{}),10000);
  await fs.writeFile(path.join(output,'publisher.json'),JSON.stringify({at:new Date().toISOString(),initializing:true}));
  const bundle=await esbuild.build({entryPoints:[path.join(root,'tests/fixtures/cloud-recording-publisher.jsx')],bundle:true,write:false,format:'esm',platform:'browser',tsconfig:path.join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"production"'}});
  server=http.createServer(async(req,res)=>{
    try{
      if(req.url==='/whiteboard'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(whiteboard));}
      if(req.url==='/credential'){
        res.setHeader('content-type','application/json');return res.end(JSON.stringify(bootstrap.credential));
      }
      if(req.url==='/publisher.js'){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles[0].contents);}
      if(req.url==='/speech.wav'){res.setHeader('content-type','audio/wav');return res.end(await fs.readFile(path.join(root,'node_modules/.cache/cloud-recording-live/speech.wav')));}
      if(req.url==='/evidence'&&req.method==='POST'){
        const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>2e6){res.writeHead(413);return res.end();}chunks.push(chunk);}
        const data=JSON.parse(Buffer.concat(chunks));await fs.writeFile(path.join(output,'publisher.json'),JSON.stringify(data,null,2));res.end('ok');return;
      }
      if(req.url!=='/'){res.writeHead(404);return res.end();}
      res.setHeader('content-type','text/html');res.end('<!doctype html><title>Cloud media verification</title><script type="module" src="/publisher.js"></script>');
    }catch{res.writeHead(500);res.end('Fixture operation failed');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  win=new BrowserWindow({width:960,height:640,show:false,webPreferences:{partition:`cloud-publisher-${f.runId}`,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
  console.log('Real RTC publisher launched with synthetic speech and video');
  setTimeout(()=>void close(),8*60*1000);
}).catch(error=>{console.error(error.message);void close(1);});
async function close(code=0){
  clearInterval(heartbeat);
  try{if(win&&!win.isDestroyed())await win.webContents.executeJavaScript('window.cloudPublisher?.stop()');}catch{}
  win?.destroy();server?.close();await fs.rm(profile,{recursive:true,force:true});app.exit(code);
}
process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
