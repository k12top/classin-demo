/* eslint-disable @typescript-eslint/no-require-imports -- Full production classroom in Chromium; media/whiteboard/signaling providers and HTTP persistence are simulated. */
const { app, BrowserWindow } = require("electron");
app.on('window-all-closed',()=>{});
const fs = require("node:fs/promises"), path = require("node:path"), http = require("node:http"), https = require("node:https"), os = require("node:os"), assert = require("node:assert/strict"), esbuild = require("esbuild");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../.."), cache = path.join(root, "node_modules/.cache/screen-board-restore"), output = process.env.CLASSROOM_SCREEN_TEST_OUTPUT || path.join(root, "outputs/classroom-local-camera-share-2026-11-08");
let win, server, payload, role = "teacher", recorder = false, actions = [], holdInkContext = false, releaseInkContext, inkContextRequest, tempCert, inkFail = false, holdUpload = false, releaseUpload, inkUploads = [];
const member = (userId, displayName, rtcUid) => ({ userId, displayName, avatar: "", role: userId === "teacher" ? "teacher" : "student", rtcUids: [rtcUid], screenUids: [rtcUid + 100], signalingUserIds: [userId + "-sig"], online: true, onStage: true, stageState: "accepted", handRaisedAt: null, microphoneAllowed: true, cameraAllowed: true, whiteboardWritable: false, chatMuted: false, rewardCount: 0, screenShareState: userId === "teacher" ? "idle" : "accepted", screenShareRequestedAt: null });
const seed = () => {
  const capabilities = Object.fromEntries(["canStartClass", "canEndClass", "canControlRecording", "canManageStage", "canManageMembers", "canManageChat", "canManageWhiteboard", "canManageInterpretation", "canGiveReward", "canRunEngagement"].map(k => [k, role === "teacher"]));
  return {
    mode: "smallClass", modePolicy: { mode: "smallClass", roomType: 2, maxStageStudents: 4, maxParticipants: 6, showLiveRail: true, showMemberRoster: true, showHandRaise: true, showPublicQuestions: false, allowBreakouts: false, studentCanRequestStage: true, studentCanShareWhenOnStage: true, defaultStudentOnStage: false },
    credential: { provider: "agora", appId: "fixture", userId: role, role, rtcUid: role === "teacher" ? 101 : 102, publishAllowed: true, screenShare: { rtcUid: role === "teacher" ? 201 : 202, token: "fixture" }, token: "fixture", channelName: "fixture", expiresInSeconds: 21600 }, mediaProfile: {},
    course: { id: "course-fixture", sessionId: "session-fixture", name: "数学 · 二次方程", roomType: 2, teacherName: "主讲老师", teacherId: "teacher", startTime: new Date(Date.now() - 300000).toISOString(), endTime: new Date(Date.now() + 3600000).toISOString(), status: "live" },
    runtime: { revision: 1, status: "live", classStartMode: "manual", recordingStartMode: "disabled", startedAt: new Date(Date.now() - 300000).toISOString(), graceEndsAt: null, stageMode: "whiteboard", stageLocked: false, spotlightUserId: null, activeCoursewareId: null, chatEnabled: true, assistantPermissions: {}, timerStartedAt: null, timerDurationSec: null, timerPausedAt: null, interpretation: { enabled: false, provider: "shengwang", sourceLanguage: "zh-CN", targetLanguages: [], status: "stopped", error: null },
      composition: { version: 1, seatOrder: ["other", "student", "teacher"], boardItems: [
        { id: "camera:student", kind: "camera", sourceId: "student", rect: { x: .14, y: .18, width: .28, height: .36 }, zIndex: 3, locked: false, visible: true, shape: "circle" },
        { id: "camera:teacher", kind: "camera", sourceId: "teacher", rect: { x: .68, y: .06, width: .23, height: .28 }, zIndex: 4, locked: true, visible: true, shape: "rounded" }
      ], updatedBy: "teacher", updatedAt: new Date().toISOString(), screenShares: {} }, members: [member("teacher", "主讲老师", 101), member("student", "Mia", 102), member("other", "Leo", 103)] },
    engagement: { activeBuzz: null, selector: null, rewards: [] }, capabilities: { ...capabilities, canShareScreen: true, canParticipateInEngagement: true }, signaling: { appId: "fixture", userId: role + "-sig", channelName: "fixture", token: "fixture", expiresInSeconds: 21600 },
    whiteboard: { enabled: true, provider: "netless", writable: role === "teacher", roomUuid: "fixture", roomToken: "fixture", appIdentifier: "fixture", region: "cn-hz" },
    courseware: [], messages: [], spaces: [], questions: [], captions: [], interpretationAvailability: { shengwang: false, wordly: false }, recording: { enabled: false, status: null, mode: null, fallbackFrom: null },
  };
};
async function main() {
  await fs.mkdir(cache, { recursive: true }); await fs.mkdir(output, { recursive: true });
  const stubs = {
    "next/navigation": `const params=new URLSearchParams(location.search),router={push(){},replace(){}};export const useSearchParams=()=>params;export const useRouter=()=>router;`,
    "@/lib/auth-context": `const user={userId:window.fixtureRole,name:window.fixtureRole,displayName:window.fixtureRole};export const useAuth=()=>({user,loading:false});`,
    "@/components/classroom/teacher-assistant": "export const TeacherAssistant=()=>null;",
    "@/components/classroom/screen-share-annotations": `import React,{useEffect} from "react";export const ScreenShareAnnotations=({screenId,hidden,writable,onControllerChange})=>{useEffect(()=>{if(!window.fixtureDesktop||!hidden||!writable)return;const controller={setTool:()=>{},setStrokeColor:()=>{},setStrokeWidth:()=>{},setEraserSize:()=>{},setTextSize:()=>{},insertDesktopInk:async(stroke,upload)=>{const url=await upload('data:image/png;base64,iVBORw0KGgo=');window.fixtureInkWrites.push({stroke,url});return true}};onControllerChange(controller);return()=>onControllerChange(null)},[hidden,writable,onControllerChange]);return <div className="fixture-annotations" data-screen-id={screenId} data-hidden={String(Boolean(hidden))}/>};`,
    "@/components/classroom/fastboard-surface": `import React,{useEffect,useRef}from'react';export const preloadFastboard=async()=>{};export function FastboardSurface({onReadyChange}){const id=useRef(crypto.randomUUID());useEffect(()=>{onReadyChange(true);return()=>onReadyChange(false)},[onReadyChange]);return <div className="fixture-whiteboard" data-instance={id.current}><h2>二次方程</h2><p>ax² + bx + c = 0</p><p>共享结束后，摄像头回到原来的白板位置。</p></div>}`,
    "@/lib/classroom/signaling/provider-factory": `export const createClassroomSignalingProvider=()=>({connect:async(_,onEvent)=>{window.fixtureSignal=onEvent},publish:async()=>{},disconnect:async()=>{}});`,
    "@/lib/classroom/client/provider-factory": `
      let listener;const participants=[['101','主讲老师'],['102','Mia'],['103','Leo']].map(([id,displayName])=>({id,displayName,kind:'camera',isLocal:!window.fixtureRecorder&&id===(window.fixtureRole==='teacher'?'101':'102'),hasVideo:true,hasAudio:false}));
      let snapshot={connectionState:'connected',participants,focusedParticipantId:null,network:{uplinkQuality:1,downlinkQuality:1,latencyMs:20,packetLossPercent:0},local:{microphoneOn:false,cameraOn:true,screenSharing:false,videoQuality:'hd'}};
      const emit=()=>listener?.({...snapshot,local:{...snapshot.local},participants:[...snapshot.participants]});
      const provider=new Proxy({getSnapshot:()=>snapshot,subscribe:cb=>{listener=cb;emit();return()=>{listener=null}},subscribeTokenExpiry:()=>()=>{},subscribeCaptions:()=>()=>{},connect:async()=>emit(),disconnect:async()=>{},getMicrophoneLevel:()=>0,
        attachVideo:(id,element)=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');ctx.fillStyle=id==='101'?'#263b53':id==='102'?'#425347':'#4c3b55';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.font='28px sans-serif';ctx.fillText(id==='101'?'主讲老师':id==='102'?'Mia':id==='103'?'Leo':'共享屏幕',40,190);const video=document.createElement('video');video.dataset.fixtureTrack=id;video.className='fixture-video';video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=canvas.captureStream(1);element.replaceChildren(video);video.play().catch(()=>{})},detachVideo:(id,element)=>{element.querySelector('video')?.srcObject?.getTracks().forEach(track=>track.stop());element.replaceChildren()},
        startScreenShare:async (authorize,options)=>{if(window.cancelCapture)throw new DOMException('Cancelled','NotAllowedError');await authorize();snapshot={...snapshot,participants:[...participants,{id:window.fixtureRole==='teacher'?'201':'202',kind:'screen',isLocal:true,hasVideo:true,hasAudio:false}],local:{...snapshot.local,screenSharing:true,screenShareMode:options.mode}};emit()},
        stopScreenShare:async()=>{snapshot={...snapshot,participants:[...participants],local:{...snapshot.local,screenSharing:false}};emit()},toggleCamera:async()=>{snapshot.local.cameraOn=!snapshot.local.cameraOn;const camera=participants.find(item=>item.isLocal);camera.hasVideo=snapshot.local.cameraOn;emit();return snapshot.local.cameraOn},toggleMicrophone:async()=>{},
      },{get:(target,key)=>key==='then'?undefined:key in target?target[key]:async()=>{}});
      window.fixture={provider,remote:async(active,user='teacher',claim='remote-claim')=>{const response=await fetch('/fixture/remote',{method:'POST',body:JSON.stringify({active,user,claim})});const result=await response.json();snapshot={...snapshot,participants:active?[...participants,{id:String(result.uid),displayName:'共享屏幕',kind:'screen',isLocal:false,hasVideo:true,hasAudio:false}]:participants};emit();window.fixtureSignal?.({courseId:'session-fixture',revision:result.revision,topic:'runtime'},'teacher-sig')},revokeInk:async()=>{const result=await fetch('/fixture/revoke-ink',{method:'POST'}).then(r=>r.json());window.fixtureSignal?.({courseId:'session-fixture',revision:result.revision,topic:'runtime'},'teacher-sig')},externalStop:()=>provider.stopScreenShare()};export const createClassroomMediaProvider=async()=>provider;
    `,
  };
  const bundle = await esbuild.build({ stdin: { resolveDir: root, loader: "tsx", contents: `import React from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{ClassroomV3}from'@/components/classroom/classroom-v3';createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><ClassroomV3 recorderMode={window.fixtureRecorder}/></I18nProvider>);` }, outfile: path.join(cache, "fixture.js"), bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env": "{}" }, tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "provider-boundaries", setup(build) {
    build.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: "fixture" } : undefined);
    build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
  } }] });
  const cssFile = path.join(cache, "global.css");
  execFileSync("node", [require.resolve("tailwindcss/lib/cli.js"), "-i", path.join(root, "src/app/globals.css"), "-o", cssFile, "--minify"], { cwd: root, stdio: "pipe" });
  const css = await fs.readFile(cssFile, "utf8") + '\n' + (await Promise.all(["classroom-classin.css", "classroom-light.css", "classroom-responsive.css"].map(name => fs.readFile(path.join(root, "src/app", name), "utf8")))).join('\n') + '\n' + (bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '');
  const listener=async (request, response) => {
    if (request.url === '/fixture.js') { response.setHeader('Content-Type','application/javascript');return response.end(bundle.outputFiles.find(file=>file.path.endsWith('.js')).text); }
    if (request.url === '/fixture.css') { response.setHeader('Content-Type','text/css');return response.end(css); }
    if(request.method==='POST'&&request.url.endsWith('/classroom/screen-ink')) {
      const chunks=[];for await(const chunk of request)chunks.push(chunk);
      const form=await new Request('https://fixture.invalid',{method:'POST',headers:request.headers,body:Buffer.concat(chunks)}).formData();
      inkUploads.push({id:form.get('uploadId'),clientId:form.get('clientId'),claimId:form.get('claimId')});
      if(holdUpload)await new Promise(resolve=>{releaseUpload=resolve});
      if(inkFail){response.statusCode=503;return response.end('{}');}
      response.setHeader('content-type','application/json');return response.end(JSON.stringify({image:{id:form.get('uploadId')}}));
    }
    if (request.url.startsWith('/api/') || request.url.startsWith('/fixture/')) {
      let body='';for await(const chunk of request)body+=chunk;const input=body?JSON.parse(body):{};
      response.setHeader('Content-Type','application/json');
      if(request.url.endsWith('/classroom/screen-ink/context')) { inkContextRequest={url:request.url,body:input};if(holdInkContext)await new Promise(resolve=>{releaseInkContext=resolve});response.statusCode=204;return response.end(); }
      if(request.url==='/fixture/revoke-ink'){payload.whiteboard.writable=false;payload.runtime.members.find(member=>member.userId===role).whiteboardWritable=false;payload.runtime.revision++;return response.end(JSON.stringify({revision:payload.runtime.revision}));}
      if(request.url==='/fixture/remote') { const uid=input.user==='teacher'?201:202;payload.runtime.composition.screenShares=input.active?{main:{userId:input.user,clientId:'remote-tab',rtcUid:uid,claimId:input.claim}}:{};payload.runtime.revision++;return response.end(JSON.stringify({uid,revision:payload.runtime.revision})); }
      if(request.url.endsWith('/classroom/actions')) { const action=input.action;actions.push(action);
        if(action.type==='startScreenShare')payload.runtime.composition.screenShares={main:{userId:role,clientId:input.clientId,rtcUid:role==='teacher'?201:202,claimId:action.claimId}};
        if(action.type==='releaseScreenShare')payload.runtime.composition.screenShares={};
        if(action.type==='updateBoardItem'){const item=payload.runtime.composition.boardItems.find(item=>item.id===action.itemId);for(const key of ['rect','shape','locked','visible'])if(key in action)item[key]=action[key];}
        payload.runtime.revision++;return response.end(JSON.stringify({runtime:payload.runtime,engagement:payload.engagement}));
      }
      if(request.url.includes('/messages'))return response.end(JSON.stringify({messages:[]}));
      if(request.url.includes('whiteboard-credential'))return response.end(JSON.stringify({whiteboard:payload.whiteboard}));
      return response.end(JSON.stringify(payload));
    }
    response.end(`<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>.fixture-whiteboard{position:absolute;inset:0;background:#f6f7fa;color:#283344;padding:42px;font:24px system-ui}.fixture-whiteboard h2{font-size:32px}.fixture-whiteboard p{margin:24px 0}.fixture-video{position:absolute;inset:0;display:grid;place-items:center;background:#263b53;color:white;font:26px system-ui}.fixture-video[data-fixture-track="102"]{background:#425347}.fixture-video[data-fixture-track="103"]{background:#4c3b55}</style><div id="root"></div><script>window.fixtureRole=${JSON.stringify(role)};window.fixtureRecorder=${recorder};window.fixtureDesktop=new URLSearchParams(location.search).has('desktopInk');window.fixtureInkWrites=[];window.fixtureInkFailures=0;if(window.fixtureDesktop)window.classroomDesktop={isDesktop:true,platform:'darwin',setSharingState:async value=>{window.fixtureSharing=value},setSharingSeats:async()=>{},setSharingControls:async value=>{window.fixtureControls=value},onScreenInk:cb=>{window.fixtureInkCallback=cb;return()=>{if(window.fixtureInkCallback===cb)window.fixtureInkCallback=null}},reportScreenInkFailure:async()=>{window.fixtureInkFailures++}};</script><script src="/fixture.js"></script></html>`);
  };
  if(process.env.CLASSROOM_SCREEN_TEST_HTTPS==='1'){
    tempCert=await fs.mkdtemp(path.join(os.tmpdir(),'classroom-ink-https-'));const key=path.join(tempCert,'key.pem'),cert=path.join(tempCert,'cert.pem');
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1'],{stdio:'ignore'});
    app.on('certificate-error',(event,_contents,url,_error,_certificate,callback)=>{if(new URL(url).hostname==='127.0.0.1'){event.preventDefault();callback(true)}else callback(false)});
    server=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},listener);
  }else server=http.createServer(listener);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await app.whenReady();
  win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{backgroundThrottling:false,partition:'screen-board-'+Date.now()}});
  if(process.env.CLASSROOM_SCREEN_TEST_HTTPS==='1')win.webContents.session.setCertificateVerifyProc((request,callback)=>callback(request.hostname==='127.0.0.1'?0:-3));
  const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
  win.webContents.debugger.attach('1.3');
  const run=async code=>{try{return await win.webContents.executeJavaScript(code)}catch(error){throw new Error(String(error)+'; '+errors.join(';'))}};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const wait=async code=>{const end=Date.now()+12000;while(!await run(`Boolean(${code})`)){if(Date.now()>end)throw new Error('timeout: '+code+'; '+errors.join(';')+'; media='+await run(`JSON.stringify(window.fixture?.provider.getSnapshot())`)+'; seats='+await run(`Array.from(document.querySelectorAll('.classroom-v3-seat')).map(e=>e.outerHTML.slice(0,1300)).join(' | ')`));await pause(40)}};
  const point=async selector=>run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error(${JSON.stringify('missing '+selector)});const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  const click=async selector=>{const startsShare=await run(`document.querySelector(${JSON.stringify(selector)})?.dataset.dockAction==='share'`);const p=await point(selector);for(const type of ['mousePressed','mouseReleased'])await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});if(startsShare){await wait(`document.querySelector('.classroom-share-menu')`);await click('.classroom-share-menu > button:nth-of-type(2)')}};
  const shot=async name=>{await pause(350);await fs.writeFile(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG())};
  const seats=()=>run(`Array.from(document.querySelectorAll('.classroom-v3-seat-copy strong')).map(e=>e.childNodes[0].textContent.trim())`);
  const boardCount=()=>run(`document.querySelectorAll('.classroom-v3-board-item').length`);
  const style=()=>run(`Array.from(document.querySelectorAll('.classroom-v3-board-item')).map(e=>({left:e.style.left,top:e.style.top,width:e.classList.contains('is-circle')?'responsive-circle':e.style.width,height:e.classList.contains('is-circle')?'responsive-circle':e.style.height,aspect:e.style.aspectRatio,circle:e.classList.contains('is-circle'),locked:e.classList.contains('is-locked')}))`);
  const load=async(nextRole,nextRecorder=false,extra='')=>{role=nextRole;recorder=nextRecorder;payload=seed();if(extra.includes('studentInk=1')){payload.whiteboard.writable=true;payload.runtime.members.find(member=>member.userId===role).whiteboardWritable=true;}actions=[];await win.loadURL(`${process.env.CLASSROOM_SCREEN_TEST_HTTPS==='1'?'https':'http'}://127.0.0.1:${server.address().port}/?sessionId=session-fixture&lang=zh-CN${recorder?'&is_recorder=1&recorderToken=fixture&recordingId=fixture':''}${extra}`);await wait(`document.querySelectorAll('.classroom-v3-board-item').length===2`);await pause(300)};
  const shareButton='button[data-dock-action="share"],button[data-dock-action="stop-share"]';
  const localSeat='.classroom-v3-seat.has-sharing-camera';
  const checkSelfPreview=async()=>{
    await wait(`document.querySelector('${localSeat} video[data-fixture-track="101"]')?.readyState>=2`);
    assert.equal(await run(`document.querySelector('${localSeat} video').srcObject.getVideoTracks()[0].readyState`),'live');
    assert.equal(await run(`document.querySelector('${localSeat} .classroom-seat-sharing').textContent.trim()`),'正在共享');
    assert.equal(await run(`document.querySelectorAll('${localSeat} [data-participant-id="201"]').length`),0,'self preview plays camera, never shared desktop');
    assert.ok(await run(`(()=>{const seat=document.querySelector('${localSeat}').getBoundingClientRect(),badge=document.querySelector('${localSeat} .classroom-seat-sharing').getBoundingClientRect();return badge.top>=seat.top&&badge.bottom<=seat.bottom&&badge.right<=seat.right&&badge.height<seat.height/2})()`),'sharing badge stays inside camera tile');
  };
  await load('teacher');
  assert.deepEqual(await seats(),['Leo','主讲老师']);const original=await style(),saved=JSON.stringify(payload.runtime.composition.boardItems),order=[...payload.runtime.composition.seatOrder];const boardInstance=await run(`document.querySelector('.fixture-whiteboard').dataset.instance`);
  await shot('whiteboard-before');
  await click(shareButton);await wait(`document.querySelector('.is-screen-share')&&document.querySelectorAll('.classroom-v3-board-item').length===0`);
  assert.equal(await run(`fixture.provider.getSnapshot().local.screenShareMode`),'portrait');
  await wait(`document.querySelector('.fixture-annotations')?.dataset.hidden==='true'`);
  assert.ok((await run(`document.querySelector('.fixture-annotations').dataset.screenId`)).includes(payload.runtime.composition.screenShares.main.claimId),'local writer follows the active share claim');
  await checkSelfPreview();
  await run('fixture.provider.toggleCamera()');await wait(`!document.querySelector('${localSeat}')`);
  assert.equal(await run(`document.querySelectorAll('.classroom-v3-seat.is-sharing video').length`),0,'camera off removes self video');
  await run('fixture.provider.toggleCamera()');await checkSelfPreview();
  assert.deepEqual(await seats(),['Leo','Mia','主讲老师']);assert.equal(await run(`document.querySelectorAll('.classroom-v3-seat-controls button[title="移动到黑板"]').length`),0);assert.equal(await run(`document.querySelectorAll('button.classroom-v3-seat-preview').length`),0,'sharing cannot reset a saved board placement');assert.equal(JSON.stringify(payload.runtime.composition.boardItems),saved);await shot('screen-sharing');
  win.setContentSize(390,844);await checkSelfPreview();await shot('mobile-local-camera-sharing');win.setContentSize(1440,1000);
  await click(shareButton);await wait(`!document.querySelector('.is-screen-share')&&document.querySelectorAll('.classroom-v3-board-item').length===2`);await pause(300);
  assert.equal(await run(`document.querySelectorAll('.classroom-v3-seat.is-sharing').length`),0,'stop clears sharing badge');
  assert.deepEqual(await style(),original);assert.deepEqual(payload.runtime.composition.seatOrder,order);assert.equal(await run(`document.querySelector('.fixture-whiteboard').dataset.instance`),boardInstance,'whiteboard remains mounted');await shot('whiteboard-restored');
  await run(`document.querySelector(${JSON.stringify(shareButton)}).click()`);await wait(`document.querySelector('.classroom-share-menu')`);await click('.classroom-share-menu > button:nth-of-type(1)');
  await wait(`fixture.provider.getSnapshot().local.screenShareMode==='screen'&&document.querySelector('.is-screen-share')`);await checkSelfPreview();
  await click(shareButton);await wait(`!document.querySelector('.is-screen-share')&&document.querySelectorAll('.classroom-v3-board-item').length===2`);
  await click(shareButton);await wait(`document.querySelectorAll('.classroom-v3-board-item').length===0`);await run('fixture.externalStop()');await wait(`document.querySelectorAll('.classroom-v3-board-item').length===2`);
  await run('window.cancelCapture=true');await click(shareButton);await pause(300);assert.equal(await boardCount(),2,'cancelled picker keeps board cameras');await run('window.cancelCapture=false');
  assert.ok(!actions.some(action=>['placeBoardItem','removeBoardItem','resetComposition','reorderSeats'].includes(action.type)),'sharing never rewrites saved placement/order');
  for(const viewer of ['teacher','student']){
    await load(viewer);const before=await style();await run(`fixture.remote(true,'student')`);await wait(`document.querySelector('.is-screen-share')&&document.querySelectorAll('.classroom-v3-board-item').length===0`);assert.equal((await seats()).length,3);await wait(`document.querySelector('.fixture-annotations')`);assert.equal(await run(`document.querySelector('.fixture-annotations').dataset.screenId`),JSON.stringify(['main','202','remote-claim']));await run(`fixture.remote(true,'student','next-capture')`);await wait(`document.querySelector('.fixture-annotations')?.dataset.screenId.includes('next-capture')`);
    await run('fixture.remote(false)');await wait(`!document.querySelector('.is-screen-share')&&document.querySelectorAll('.classroom-v3-board-item').length===2`);await pause(300);assert.deepEqual(await style(),before);
  }
  win.setContentSize(390,844);await load('teacher');await run(`fixture.remote(true)`);await wait(`document.querySelectorAll('.classroom-v3-seat').length===3&&document.querySelectorAll('.classroom-v3-board-item').length===0`);await shot('mobile-screen-sharing');assert.equal(await boardCount(),0);assert.equal((await seats()).length,3);await run('fixture.remote(false)');await wait(`document.querySelectorAll('.classroom-v3-board-item').length===2`);await shot('mobile-whiteboard-restored');
  win.setContentSize(1440,1000);holdInkContext=true;inkContextRequest=undefined;await load('student',false,'&shareAccess=guest-token');await run(`fixture.remote(true,'teacher')`);await wait(`document.querySelector('.fixture-annotations')`);await wait(`window.fixtureSignal`);assert.deepEqual(inkContextRequest?.body,{shareAccess:'guest-token'});assert.ok(!inkContextRequest.url.includes('guest-token'));await run(`window.inkBefore=document.querySelector('.fixture-annotations')`);holdInkContext=false;releaseInkContext();await wait(`document.querySelector('.fixture-annotations')!==window.inkBefore`);await run(`fixture.remote(false)`);
  await load('teacher',true);await run('fixture.remote(true)');await wait(`document.querySelectorAll('.classroom-v3-recorder-camera').length===3&&document.querySelectorAll('.classroom-v3-board-item').length===0`);await shot('recorder-screen-sharing');assert.equal(await boardCount(),0);assert.equal(await run(`document.querySelectorAll('.classroom-v3-recorder-camera').length`),3);await run('fixture.remote(false)');await wait(`document.querySelectorAll('.classroom-v3-board-item').length===2&&document.querySelectorAll('.classroom-v3-recorder-camera').length===1`);
  if(process.env.CLASSROOM_SCREEN_TEST_HTTPS==='1'||process.env.CLASSROOM_SCREEN_TEST_LOOPBACK==='1'){
    await load('teacher',false,'&desktopInk=1');await click(shareButton);await wait(`window.fixtureControls?.inkEnabled&&window.fixtureInkCallback`);
    const stroke={points:[{x:.2,y:.3},{x:.7,y:.8}],color:'#ed3b3b',width:.004,aspect:9/16};
    await run(`window.fixtureInkCallback(${JSON.stringify(stroke)})`);await wait(`window.fixtureInkWrites.length===1`);
    assert.equal(inkUploads.length,1);assert.equal(inkUploads[0].claimId,payload.runtime.composition.screenShares.main.claimId);assert.equal(inkUploads[0].clientId,payload.runtime.composition.screenShares.main.clientId);
    const written=await run(`window.fixtureInkWrites[0]`);assert.deepEqual(written.stroke,stroke);assert.equal(written.url,`${process.env.CLASSROOM_SCREEN_TEST_HTTPS==='1'?'https':'http'}://127.0.0.1:${server.address().port}/api/sessions/session-fixture/classroom/screen-ink/${inkUploads[0].id}`);
    inkFail=true;await run(`window.fixtureInkCallback(${JSON.stringify(stroke)})`);await wait(`window.fixtureInkFailures===1`);assert.equal(await run(`window.fixtureInkWrites.length`),1);inkFail=false;
    holdUpload=true;await run(`window.fixtureInkCallback(${JSON.stringify(stroke)})`);for(let i=0;i<100&&!releaseUpload;i++)await pause(30);assert.ok(releaseUpload,'upload reached server before stopping');
    await click(shareButton);await wait(`!window.fixtureInkCallback`);holdUpload=false;releaseUpload();releaseUpload=undefined;await pause(300);assert.equal(await run(`window.fixtureInkWrites.length`),1,'stopping sharing aborts in-flight ink');
    await load('student',false,'&desktopInk=1&studentInk=1');await click(shareButton);await wait(`window.fixtureControls?.inkEnabled&&window.fixtureInkCallback`);holdUpload=true;await run(`window.fixtureInkCallback(${JSON.stringify(stroke)})`);for(let i=0;i<100&&!releaseUpload;i++)await pause(30);assert.ok(releaseUpload);
    await run(`fixture.revokeInk()`);await wait(`!window.fixtureInkCallback&&!window.fixtureControls?.inkEnabled`);holdUpload=false;releaseUpload();releaseUpload=undefined;await pause(300);assert.equal(await run(`window.fixtureInkWrites.length`),0,'revoking student write permission aborts in-flight ink');
    console.log('Classroom forwards desktop ink under the active share, reports failure, and aborts uploads on stop or revoked permission');
  }
  assert.deepEqual(errors,[]);
  console.log('PASS full production ClassroomV3: camera and sharing layout, board restoration, viewer ink-context readiness and recorder layout. Media SDKs and persistence are simulated.');
}
main().then(()=>cleanup(0),error=>{console.error(error);cleanup(1)});
async function cleanup(code){releaseUpload?.();releaseInkContext?.();win?.destroy();server?.close();if(tempCert)await fs.rm(tempCert,{recursive:true,force:true});app.exit(code)}
