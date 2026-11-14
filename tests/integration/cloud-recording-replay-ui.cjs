// Actual production Next playback UI and authenticated APIs, real cloud H264/ASR output.
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {harness}=require('./cloud-recording-access.cjs');
const sharp=require('sharp');
const output=path.resolve(__dirname,'../../outputs/cloud-recording-live');
const profile=require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(),'cloud-replay-'));
app.setPath('userData',profile);
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.on('window-all-closed',()=>{});
app.on('will-quit',()=>require('node:fs').rmSync(profile,{recursive:true,force:true}));
const deadline=setTimeout(()=>{console.error('Replay verification exceeded five minutes');app.exit(1);},300000);
let win,currentActor;
app.whenReady().then(async()=>{
  const h=await harness(),results=[];
  const activities=JSON.parse(await fs.readFile(path.join(output,'activities.json'),'utf8'));
  const recordings=await h.request('teacher',`/api/sessions/${h.f.sessionId}/recordings`);
  const recording=recordings.recordings.find(item=>item.playbackUrl);assert.ok(recording);
  const source=await h.request('student',recording.playbackUrl+'&delivery=url');
  const response=await fetch(source.url||source.playbackUrl,{signal:AbortSignal.timeout(60000)});assert.ok(response.ok);
  const file=Buffer.from(await response.arrayBuffer());assert.ok(file.length>1000&&file.length<50*1024*1024,'Bounded real recording file');
  const allReleased=process.argv.includes('--released-all');
  for(const actor of allReleased?['other']:['teacher','student','other']){
    currentActor=actor;
    console.log(`Checking ${actor} replay`);
    win=new BrowserWindow({width:1440,height:1000,show:true,webPreferences:{partition:`cloud-replay-${h.f.runId}-${actor}`,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});
    const base='http://127.0.0.1:3000';
    await win.webContents.session.cookies.set({url:base,name:'classroom_session',value:h.tokens[actor],httpOnly:true,sameSite:'lax'});
    await win.webContents.session.cookies.set({url:base,name:'NEXT_LOCALE',value:'en'});
    const run=code=>win.webContents.executeJavaScript(code);
    async function wait(code,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,200));}await fs.writeFile(path.join(output,`${actor}-failed.txt`),await run('document.body.innerText'));throw Error(`${actor}: ${code}`);}
    await win.loadURL(h.f.url.replace('http://localhost:3000',base)+'&embed=1');
    await wait('document.querySelector("video")?.readyState>=2');
    await run('document.querySelector("video").muted=true;document.querySelector("video").play()');
    await wait('document.querySelector("video").currentTime>1');
    const media=await run('(()=>{const v=document.querySelector("video");return {width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime,frames:v.getVideoPlaybackQuality().totalVideoFrames}})()');
    assert.equal(media.width,1920);assert.equal(media.height,1080);assert.ok(media.frames>1);assert.ok(media.duration>15);
    let audio;
    if(actor==='teacher'){
      audio=await run(`(async()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(file.toString('base64'))}),c=>c.charCodeAt(0));const context=new AudioContext();try{const decoded=await context.decodeAudioData(bytes.buffer);const samples=decoded.getChannelData(0);let sum=0,peak=0;for(const sample of samples){sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}return{duration:decoded.duration,channels:decoded.numberOfChannels,rms:Math.sqrt(sum/samples.length),peak};}finally{await context.close();}})()`);
      assert.ok(audio.rms>0.001&&audio.peak>0.02,'Recorded speech must contain audible, non-silent audio');
    }
    await wait('Array.from(document.querySelectorAll("ol button")).some(b=>b.querySelector("time")&&!b.disabled)');
    const seek=await run('(()=>{const b=Array.from(document.querySelectorAll("ol button")).find(b=>b.querySelector("time")&&!b.disabled&&b.querySelector("time").textContent.split(":").reduce((sum,part)=>sum*60+Number(part),0)>=5);if(!b)return null;const time=b.querySelector("time").textContent;b.click();return time})()');
    assert.ok(seek,'A real caption must be seekable');
    await new Promise(resolve=>setTimeout(resolve,1000));
    const captionTime=await run('document.querySelector("video").currentTime');assert.ok(captionTime>1);
    await run('Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="CC").click()');
    await wait('document.querySelector("video").parentElement.querySelector("p")?.textContent.length>0');
    const videoRect=await run('(()=>{const r=document.querySelector("video").getBoundingClientRect();return{x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.floor(r.width),height:Math.floor(r.height)}})()');
    const pixels=await sharp((await win.webContents.capturePage(videoRect)).toPNG()).removeAlpha().raw().toBuffer();let coloredPixels=0;
    for(let i=0;i<pixels.length;i+=3)if(pixels[i]>=15&&pixels[i]<45&&pixels[i+1]>=45&&pixels[i+1]<85&&pixels[i+2]>=55&&pixels[i+2]<100)coloredPixels++;
    assert.ok(coloredPixels>1500,'Cloud video must contain the published teal camera tile, not a blank stage');
    await fs.writeFile(path.join(output,`${actor}-playback.png`),(await win.webContents.capturePage()).toPNG());
    await run('document.querySelectorAll("[role=tab]")[1].dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0,ctrlKey:false}))');
    await wait('document.querySelectorAll("[role=tab]")[1].getAttribute("aria-selected")==="true"');
    await wait('document.querySelector("[data-activity-dashboard]")?.textContent.includes("Cloud replay:")');
    const jump=await run('(()=>{const button=Array.from(document.querySelectorAll("[data-activity-dashboard] article button")).find(b=>b.textContent==="Jump to recording"&&!b.disabled);if(!button)return null;const startedAt=button.closest("article").querySelector("time").dateTime;button.click();return{startedAt};})()');
    assert.ok(jump,'Activity must link to its actual recording segment');
    const expectedTime=Math.max(0,(Date.parse(jump.startedAt)-Date.parse(recording.startedAt))/1000);
    await wait(`Math.abs(document.querySelector('video').currentTime-${expectedTime})<3`);
    await wait(`(()=>{const video=document.querySelector('video');return !video.seeking&&video.readyState>=3&&video.currentTime>${expectedTime+0.2};})()`);
    if(actor==='teacher'){
      await run('Array.from(document.querySelectorAll("[data-activity-dashboard] button")).find(b=>b.textContent==="By student").click()');
      await wait(`document.querySelector('[data-activity-dashboard]')?.textContent.includes(${JSON.stringify(h.users.other.displayName)})`);
      assert.ok(await run(`document.querySelector('[data-activity-dashboard]').textContent.includes(${JSON.stringify(h.users.student.displayName)})`));
    }else{
      const text=await run('document.querySelector("[data-activity-dashboard]").textContent');
      assert.ok(text.includes('My interactions'));assert.ok(!text.includes('By student'));assert.ok(!text.includes(h.users[actor==='student'?'other':'student'].displayName));
      await run('Array.from(document.querySelectorAll("[data-activity-dashboard] article button")).find(b=>b.textContent.includes("Cloud replay: answered students")).click()');
      const detailSelector=`[data-activity-history="${activities.answered}"]`;
      await wait(`document.querySelector(${JSON.stringify(detailSelector)})?.textContent.includes('How many sides')`);
      const detail=await run(`document.querySelector(${JSON.stringify(detailSelector)}).textContent`);
      assert.ok(detail.includes(actor==='student'||allReleased?'A triangle has three sides.':'Waiting for your teacher to release answers'));
      if(allReleased)assert.ok(detail.includes('Not answered'));
      await run(`document.querySelector(${JSON.stringify(detailSelector)}).scrollIntoView({block:'center'});document.querySelector(${JSON.stringify(detailSelector)}).querySelector('summary')?.click()`);
    }
    await fs.writeFile(path.join(output,`${actor}-interactions${allReleased?'-all-released':''}.png`),(await win.webContents.capturePage()).toPNG());
    results.push({actor,media,audio,coloredPixels,captionSeekLabel:seek,captionTime,interactionSeekSeconds:expectedTime});win.destroy();win=null;
  }
  await fs.writeFile(path.join(output,allReleased?'replay-all-released-ui-result.json':'replay-ui-result.json'),JSON.stringify({passed:true,results,boundary:'Actual production Next UI, native video decoder, real Agora cloud files and STT, real local HTTP authorization; short-lived fixture identities.'},null,2));
  console.log('PASS real cloud replay UI: native 1080p video/audio, caption/activity seek and role-scoped interaction history');clearTimeout(deadline);app.quit();
}).catch(async error=>{console.error(error.message);if(win&&!win.isDestroyed()){await fs.writeFile(path.join(output,`${currentActor}-failed.txt`),await win.webContents.executeJavaScript('document.body.innerText'));await fs.writeFile(path.join(output,`${currentActor}-failed.png`),(await win.webContents.capturePage()).toPNG());win.destroy();}clearTimeout(deadline);app.exit(1);});
