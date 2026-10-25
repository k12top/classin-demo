/* eslint-disable @typescript-eslint/no-require-imports -- Actual classroom React page; isolated HTTP/media/signaling fixtures. */
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),esbuild=require('esbuild'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');const functionalOnly=process.argv.includes('--functional-only');let win,server;
async function main(){
 const cache=path.join(root,'node_modules/.cache/classroom-responsive-ui');await fs.mkdir(cache,{recursive:true});
 const stubs={
  'next/navigation':`const params=new URLSearchParams(location.search);const router={push:p=>window.fixtureNavigation=p,replace:p=>window.fixtureNavigation=p,refresh:()=>{}};export const useSearchParams=()=>params;export const useRouter=()=>router;`,
  '@/lib/auth-context':`export const useAuth=()=>({user:window.fixtureUser,loading:false});`,
  '@/components/classroom/teacher-assistant':`export const TeacherAssistant=()=>null;`,
  '@/components/classroom/activity-workspace':`export const ActivityNotice=()=>null;export const ActivityWorkspace=()=>null;export const ActivityStagePresentation=()=>null;`,
  '@/components/classroom/fastboard-surface':`import React,{useEffect}from'react';const controller=new Proxy({},{get:()=>()=>{}});export const preloadFastboard=()=>Promise.resolve();export function FastboardSurface(p){useEffect(()=>{p.onControllerChange?.(controller);p.onReadyChange?.(true);return()=>p.onControllerChange?.(null)},[]);return <div className="fixture-board"><h2>集合与不等式</h2><p>已知 a &gt; 0，b &gt; 0，且 a + b = 2</p><strong>求 1/a + 1/b 的最小值</strong><p>先独立思考，再在聊天中写下你的答案。</p></div>}`,
  '@/lib/classroom/client/provider-factory':`export async function createClassroomMediaProvider(){let notify=()=>{};let snapshot={participants:[],connectionState:'connected',network:{latencyMs:20,uplinkQuality:1,downlinkQuality:1,packetLossPercent:0},local:{microphoneOn:false,cameraOn:false,screenSharing:false}};const emit=()=>notify(structuredClone(snapshot));const provider={subscribe:cb=>{notify=cb;emit();return()=>{}},subscribeCaptions:()=>()=>{},subscribeTokenExpiry:()=>()=>{},getSnapshot:()=>snapshot,getMicrophoneLevel:()=>0,getActualDeviceState:()=>({microphone:snapshot.local.microphoneOn?'on':'off',camera:snapshot.local.cameraOn?'on':'off'}),connect:async()=>emit(),disconnect:async()=>{},setPublishingCredential:async value=>{window.fixtureStats.publishingChanges++;if(!value){snapshot.local.microphoneOn=false;snapshot.local.cameraOn=false;emit()}},toggleMicrophone:async()=>{window.fixtureStats.microphoneToggles++;snapshot.local.microphoneOn=!snapshot.local.microphoneOn;emit();if(window.fixtureDelayMicrophone)await new Promise(r=>setTimeout(r,200));return snapshot.local.microphoneOn},muteMicrophone:async()=>{snapshot.local.microphoneOn=false;emit()},toggleCamera:async()=>{snapshot.local.cameraOn=!snapshot.local.cameraOn;emit();return snapshot.local.cameraOn},recoverMedia:async()=>{window.fixtureStats.recoveries++},supportsSharePortrait:()=>true,startScreenShare:async(authorize,options)=>{await authorize?.();snapshot.local.screenSharing=true;snapshot.local.screenShareMode=options?.mode||'screen';snapshot.local.screenShareCorner=options?.corner||'br';snapshot.participants.push({id:'1500000001',kind:'screen',isLocal:true,displayName:'Teacher screen',hasVideo:true,hasAudio:false});window.fixtureShareOptions=options;emit()},setScreenShareOptions:async options=>{snapshot.local.screenShareMode=options.mode;snapshot.local.screenShareCorner=options.corner;window.fixtureShareOptions=options;emit()},stopScreenShare:async()=>{snapshot.local.screenSharing=false;snapshot.participants=snapshot.participants.filter(p=>p.kind!=='screen');emit()},supportsVirtualBackground:()=>false,listDevices:async()=>({microphones:[],cameras:[]})};return new Proxy(provider,{get:(target,key)=>key==='then'?undefined:key in target?target[key]:()=>Promise.resolve()})}`,
  '@/lib/classroom/signaling/provider-factory':`export const createClassroomSignalingProvider=()=>({connect:async(_credential,onEvent,onHealth)=>{window.fixtureStats.signalingConnections++;window.fixtureReceive=onEvent;window.fixtureHealth=ready=>{window.fixtureStats.rtmReady=ready;onHealth?.(ready)};if(window.fixtureRTMFailNext){window.fixtureRTMFailNext=false;window.fixtureHealth(false);throw new Error('simulated RTM connection failure')}window.fixtureHealth(true)},publish:async event=>window.fixtureStats.events.push(event),publishToUser:async()=>{},disconnect:async()=>{}});`,
 };
 const source=`
 import React from'react';import{createRoot}from'react-dom/client';import{I18nProvider}from'@/lib/i18n/context';import{ClassroomV3}from'@/components/classroom/classroom-v3';import{classroomCapabilities}from'@/lib/classroom/policy';import{classroomModePolicy}from'@/lib/classroom/mode';import{emptyClassroomComposition}from'@/lib/classroom/composition';
 const role=new URLSearchParams(location.search).get('role')||'student';const uid=role==='student'?'student':role;window.fixtureUser={userId:uid,name:uid,displayName:role==='student'?'李明':'陈老师',avatar:'',role:role==='student'?'student':'teacher'};window.fixtureStats={events:[],requests:[],publishingChanges:0,microphoneToggles:0,recoveries:0,signalingConnections:0};
 const member=(userId,memberRole)=>({userId,role:memberRole,displayName:memberRole==='student'?'李明':memberRole==='assistant'?'林助教':'陈老师',avatar:'',online:true,connectionStatus:'online',lastSeenAt:new Date().toISOString(),reconnectUntil:new Date(Date.now()+120000).toISOString(),onStage:memberRole!=='student',stageState:memberRole==='student'?'offstage':'accepted',microphoneAllowed:memberRole!=='student',cameraAllowed:memberRole!=='student',whiteboardWritable:memberRole!=='student',screenShareState:'idle',screenShareRequestedAt:null,chatMuted:false,handRaisedAt:null,rewardCount:0,signalingUserIds:[userId+':tab'],rtcUids:[userId==='student'?2:userId==='assistant'?3:1]});
 const start=new Date(Date.now()-600000).toISOString(),end=new Date(Date.now()+3600000).toISOString();const mode=classroomModePolicy(2);const members=[member('teacher','teacher'),member('assistant','assistant'),member('student','student')];
 const credential={provider:'agora',appId:'fixture',channelName:'fixture-channel',userId:uid,rtcUid:uid==='student'?2:1,role,token:'fixture',expiresInSeconds:3600,publishAllowed:role!=='student',scenario:'communication',auxiliaryCamera:role!=='student'?{rtcUid:4,token:'fixture',userId:uid}:undefined};
 const payload={mode:'largeClass',modePolicy:mode,credential,course:{id:'fixture-course',sessionId:'fixture-session',name:'CSCA 培训 · 第 1 课',roomType:2,teacherId:'teacher',teacherName:'陈老师',status:'live',startTime:start,endTime:end},runtime:{revision:1,status:'live',classStartMode:'manual',recordingStartMode:'disabled',startedAt:start,graceEndsAt:new Date(Date.parse(end)+600000).toISOString(),scheduledEndAt:end,scheduledStartAt:start,stageMode:'whiteboard',stageLocked:false,stageStudentLimit:null,stageInviteBypassLimit:true,spotlightUserId:null,activeCoursewareId:null,chatEnabled:true,timerStartedAt:null,timerDurationSec:null,timerPausedAt:null,assistantPermissions:{},interpretation:{enabled:true,provider:'shengwang',sourceLanguage:'zh-CN',targetLanguages:['en-US'],status:'running',error:null},composition:emptyClassroomComposition(),members,presenceObservedAt:new Date().toISOString()},engagement:{activeBuzz:null,selector:null},mediaProfile:{},capabilities:classroomCapabilities(role,mode),signaling:{provider:'agora',appId:'fixture',channelName:'fixture-session',userId:uid+':tab',token:'fixture'},whiteboard:{enabled:true,provider:'netless',appId:'fixture',roomUuid:'fixture',roomToken:'fixture',writable:role!=='student'},spaces:[],questions:[],courseware:[{id:'file',name:'课堂讲义.webp',ext:'webp',size:120000,studentCanView:true,studentCanDownload:true,whiteboardEnabled:false,taskStatus:'Pending',type:'static',previewUrl:'/api/fixture/file?mode=preview',downloadUrl:'/api/fixture/file',conversion:null,conversionError:null}],messages:[{id:'message',senderId:'student-other',senderName:'Tanu',senderRole:'student',scope:'classroom',kind:'text',content:'Terima kasih, guru.',createdAt:new Date().toISOString(),deletedAt:null}],captions:[{id:'caption',speakerId:'teacher',speakerName:'陈老师',text:'请先独立思考，再分享你的答案。',sourceLanguage:'zh-CN',detectedLanguage:'zh-CN',provider:'shengwang',translations:{'en-US':'Think first, then share your answer.'},isFinal:true,occurredAt:new Date().toISOString(),createdAt:new Date().toISOString()}],interpretationAvailability:{shengwang:true,wordly:false},recording:{enabled:false,status:null,mode:null,fallbackFrom:null}};
 payload.credential.screenShare={rtcUid:1500000001,userId:uid+'::screen',token:'fixture-screen'};
 payload.course.name='算法与数学思维 · 第 30 课 / Algorithms and mathematical thinking';
 payload.messages=Array.from({length:18},(_,i)=>({id:'history-'+i,senderId:i%3===0?uid:'student-'+(i%2),senderName:i%3===0?'陈老师':i%2?'李明 · Alex':'Tanu',senderRole:i%3===0?role:'student',scope:'classroom',kind:'text',content:i%3===0?'先试着把两个分数通分，再观察分子有什么变化。':i%2?'老师，这里可以用均值不等式吗？我想再确认一下条件。':'I think the minimum is 2. Could you explain the equality condition?',createdAt:new Date(Date.now()-(18-i)*60000).toISOString(),deletedAt:null}));
 payload.captions=Array.from({length:16},(_,i)=>({...payload.captions[0],id:'caption-'+i,text:i%2?'当且仅当 a = b 时，等号成立。':'先通分，再利用 a + b = 2 这个条件。',translations:{'en-US':i%2?'Equality holds if and only if a equals b.':'Find a common denominator, then use the condition a + b = 2.'},occurredAt:new Date(Date.now()-(16-i)*30000).toISOString()}));
 const phase=new URLSearchParams(location.search).get('phase');if(phase){const now=Date.now();payload.runtime.status=phase==='ended'?'ended':['waiting','ready'].includes(phase)?'waiting':'live';payload.runtime.startedAt=new Date(now-30*60000).toISOString();payload.course.startTime=new Date(now+(phase==='waiting'?5:-5)*60000).toISOString();payload.course.endTime=new Date(now+(phase==='overtime'?-8:phase==='closing'?-14:40)*60000).toISOString();payload.runtime.scheduledEndAt=payload.course.endTime;payload.runtime.scheduledStartAt=payload.course.startTime;payload.runtime.graceEndsAt=new Date(now+(phase==='closing'?35000:phase==='overtime'?7*60000:50*60000)).toISOString();payload.course.status=payload.runtime.status;}
 window.fixturePayload=payload;window.fixture={grantMedia:()=>{const student=members.find(m=>m.userId==='student');Object.assign(student,{onStage:true,stageState:'accepted',microphoneAllowed:true,cameraAllowed:false});payload.runtime.revision++;window.fixtureReceive({courseId:'fixture-session',topic:'member-permissions',actorId:'teacher',revision:payload.runtime.revision,scope:'member',targetUserId:'student',microphoneAllowed:true,cameraAllowed:false,onStage:true,stageState:'accepted'},'teacher:tab')},revokeMedia:()=>{Object.assign(members.find(m=>m.userId==='student'),{microphoneAllowed:false,cameraAllowed:false});payload.runtime.revision++;window.fixtureReceive({courseId:'fixture-session',topic:'member-permissions',actorId:'teacher',revision:payload.runtime.revision,scope:'member',targetUserId:'student',microphoneAllowed:false,cameraAllowed:false},'teacher:tab')},whiteboard:allowed=>{members.find(m=>m.userId==='student').whiteboardWritable=allowed;payload.runtime.revision++;window.fixtureReceive({courseId:'fixture-session',topic:'runtime',revision:payload.runtime.revision},'teacher:tab')},end:()=>{payload.runtime.status='ended';payload.runtime.revision++;window.fixtureReceive({courseId:'fixture-session',topic:'runtime',revision:payload.runtime.revision},'teacher:tab')}};
 const originalFetch=window.fetch.bind(window);window.fetch=async(input,init={})=>{const url=new URL(String(input),location.href);window.fixtureStats.requests.push(url.pathname);const body=init.body?JSON.parse(init.body):{};
  if(url.pathname==='/api/fixture/file')return originalFetch(input,init);
  if(url.pathname==='/api/classroom/session')return Response.json(payload);
  if(url.pathname.includes('publish-credential'))return Response.json({credential:{...credential,publishAllowed:true}});
  if(url.pathname.includes('whiteboard-credential'))return Response.json({whiteboard:{...payload.whiteboard,writable:members.find(m=>m.userId===uid).whiteboardWritable}});
  if(url.pathname.includes('renew-credential'))return Response.json({credential,signaling:payload.signaling});
  if(url.pathname.endsWith('/translate'))return Response.json({translations:Object.fromEntries(body.messageIds.map(id=>[id,{status:'completed',text:body.language==='zh-CN'?'谢谢老师。':'Thank you, teacher.'}]))});
  if(url.pathname.endsWith('/captions'))return Response.json({captions:payload.captions});
  if(url.pathname.endsWith('/state'))return Response.json(payload);
  if(url.pathname.endsWith('/messages')){if(init.method==='POST'){window.fixtureLastSend=body;if(window.fixtureFailSend)return Response.json({error:'fixture failure'},{status:400});const message={id:'sent-'+payload.messages.length,senderId:uid,senderName:'陈老师',senderRole:role,scope:body.scope||'classroom',content:body.content,createdAt:new Date().toISOString(),deletedAt:null};payload.messages.push(message);return Response.json({message,revision:payload.runtime.revision})}return Response.json({messages:payload.messages})};
  if(url.pathname.endsWith('/lifecycle')){localStorage.setItem('fixture-last-lifecycle',JSON.stringify(body));payload.runtime.revision++;const next=body.action==='extend'?new Date(Date.parse(payload.course.endTime)+body.minutes*60000).toISOString():new Date(Date.now()+3600000).toISOString();payload.course.endTime=next;payload.runtime.scheduledEndAt=next;return Response.json({timing:{startTime:start,endTime:next,revision:payload.runtime.revision}})}
  if(url.pathname.endsWith('/activities'))return Response.json({activities:[],nextCursor:null,active:null,canManage:role!=='student',canAnswer:role==='student',canPrepare:true,live:true});
  if(url.pathname.endsWith('/actions')){if(body.action?.type==='startScreenShare'){payload.runtime.composition.screenShares={main:{userId:uid,clientId:body.clientId,claimId:body.action.claimId,rtcUid:1500000001}}}if(body.action?.type==='releaseScreenShare')payload.runtime.composition.screenShares={};return Response.json({runtime:payload.runtime,refreshed:true,ok:true,status:'live'})}
  return Response.json({ok:true,targetLanguages:['en-US']});};
 document.cookie='NEXT_LOCALE=zh-CN;path=/';localStorage.setItem('locale','zh-CN');localStorage.setItem('classroom_caption_language','en-US');localStorage.setItem('classroom_caption_mode','bilingual');
 createRoot(document.getElementById('root')).render(<I18nProvider initialLocale="zh-CN"><ClassroomV3/></I18nProvider>);
 `;
 const bundle=await esbuild.build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:path.join(cache,'fixture.js'),platform:'browser',format:'iife',define:{'process.env':'{}'},tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'isolated-app',setup(build){build.onResolve({filter:/.*/},args=>args.path in stubs?{path:args.path,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:root}));}}]});
 const cssPath=path.join(cache,'global.css');execFileSync('node',[require.resolve('tailwindcss/lib/cli.js'),'-i',path.join(root,'src/app/globals.css'),'-o',cssPath,'--minify'],{stdio:'pipe'});
 const css=(await fs.readFile(cssPath,'utf8'))+'\n'+(await Promise.all(['classroom-classin.css','classroom-light.css','classroom-responsive.css'].map(name=>fs.readFile(path.join(root,'src/app',name),'utf8')))).join('\n')+'\n'+(bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text||'');
 const asset=await fs.readFile(path.join(root,'public/classroom/entry-book-v2.webp'));
 server=http.createServer((req,res)=>{if(req.url.startsWith('/fixture.js')){res.setHeader('content-type','text/javascript');return res.end(bundle.outputFiles.find(file=>file.path.endsWith('.js')).text)}if(req.url==='/fixture.css'){res.setHeader('content-type','text/css');return res.end(css)}if(req.url.startsWith('/api/fixture/file')){res.setHeader('content-type','image/webp');return res.end(asset)}if(req.url.startsWith('/api/')){res.statusCode=500;return res.end('Unmocked request')};res.end('<!doctype html><html class="light" lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>.fixture-board{height:100%;background:white;padding:clamp(20px,5vw,60px);color:#243449;font-size:20px}.fixture-board h2{font-size:32px;font-weight:700;margin-bottom:24px}.fixture-board p{margin-block:16px}.fixture-board strong{font-size:24px}</style><div id="root"></div><script src="/fixture.js"></script></html>')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 win=new BrowserWindow({width:390,height:844,show:false,webPreferences:{backgroundThrottling:false,partition:'feedback-'+Date.now()}});
 const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'||event.level>=3){errors.push(event.message);console.error('BROWSER',event.message)}});win.webContents.on('render-process-gone',(_event,details)=>console.error(details));
 const run=code=>win.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Timed out: '+code+'\n'+errors.join('\n')+'\n'+await run('document.body.innerText.slice(0,1200)')+'\n'+await run('JSON.stringify({requests:window.fixtureStats?.requests.slice(-40),navigation:window.fixtureNavigation})'))};
 const url=`http://127.0.0.1:${server.address().port}/classroom?sessionId=fixture-session`;
 const output=path.join(root,'outputs/classroom-responsive-2026-10-24');await fs.mkdir(output,{recursive:true});
 const capture=async name=>{if(functionalOnly)return;await new Promise(resolve=>setTimeout(resolve,300));await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await fs.writeFile(path.join(output,name),(await win.webContents.capturePage(undefined,{stayAwake:true})).toPNG())};

 await win.loadURL(url+'&role=teacher');await wait(`!!document.querySelector('.classroom-header-more') && !!window.fixtureReceive`);
 const click=async selector=>{await run(`document.querySelector(${JSON.stringify(selector)}).click()`)};
 const openChat=async()=>{await run(`document.querySelector('.classroom-v3-dock [data-dock-action=chat]').click()`);await wait(`!!document.querySelector('.classroom-v3-drawer[data-conversation=true]')`)};
 const dimensions=async()=>run(`(()=>{const stage=document.querySelector('.classroom-v3-stage').getBoundingClientRect();const drawer=document.querySelector('.classroom-v3-drawer')?.getBoundingClientRect();const header=document.querySelector('.classroom-v3-topbar');return {stage:{x:stage.x,y:stage.y,width:stage.width,height:stage.height},drawer:drawer?{x:drawer.x,y:drawer.y,width:drawer.width,height:drawer.height}:null,overflow:header.scrollWidth>header.clientWidth+1,headerBottom:header.getBoundingClientRect().bottom,viewport:{width:innerWidth,height:innerHeight}}})()`);
 // Rapid real control clicks must reach the provider while a microphone operation is pending.
 await run(`window.fixtureDelayMicrophone=true;for(let i=0;i<3;i++)document.querySelector('[data-dock-action=microphone]').click()`);
 await wait(`fixtureStats.microphoneToggles===3 && document.querySelector('[data-dock-action=microphone]').getAttribute('aria-busy')==='false'`);
 assert.equal(await run(`document.querySelector('[data-dock-action=microphone]').getAttribute('aria-pressed')`),'true');
 await run(`window.fixtureDelayMicrophone=false;document.querySelector('[data-dock-action=microphone]').click()`);
 await wait(`document.querySelector('[data-dock-action=microphone]').getAttribute('aria-pressed')==='false'`);
 // Header and conversation names must be visible on keyboard focus, not just screen-reader labels.
 win.webContents.focus();await run(`document.querySelector('.classroom-minimal-header>.classroom-minimal-icon').focus()`);await wait(`!!document.querySelector('.classroom-icon-tooltip')&&getComputedStyle(document.querySelector('.classroom-icon-tooltip')).visibility==='visible'`);assert.ok(await run(`document.querySelector('.classroom-icon-tooltip').textContent.length>0`));await capture('actual-focus-tooltip.png');await run(`document.activeElement.blur()`);
 const sizes=[[1920,1080,'ultrawide'],[1440,900,'wide'],[1100,800,'compact'],[900,600,'landscape-tablet'],[740,390,'landscape-phone'],[390,844,'phone'],[320,740,'small-phone']];
 const measurements=[];
 if(!functionalOnly) for(const [width,height,name] of sizes){
  await win.setContentSize(width,height);
  await run(`document.querySelector('.classroom-conversation-close')?.click()`);
  await new Promise(resolve=>setTimeout(resolve,300));
  const before=await dimensions();
  if(width>=640) await openChat();else {await run(`Array.from(document.querySelectorAll('.classroom-v3-dock > button')).find(b=>b.textContent.startsWith('聊天')).click()`);await wait(`!!document.querySelector('.classroom-conversation-close')`)}
  await new Promise(resolve=>setTimeout(resolve,350));
  const after=await dimensions();
  assert.equal(after.overflow,false,'header must fit '+name);
  assert.ok(after.stage.height>=Math.min(150,height*.3),'lesson retains usable height '+name+' '+JSON.stringify(after));
  assert.ok(after.drawer.height>=Math.min(250,height*.6),'conversation body retains usable height '+name);
  assert.ok(await run(`(()=>{const f=document.querySelector('.classroom-v3-chat-form').getBoundingClientRect(),d=document.querySelector('.classroom-v3-drawer').getBoundingClientRect();return f.height>=48&&f.bottom<=d.bottom+1&&f.bottom<=innerHeight})()`),'composer fits '+name);
  if(width>=640){assert.ok(after.stage.width<before.stage.width-250,'sidebar must reserve width '+name);assert.ok(after.drawer.x>=after.stage.x+after.stage.width-1,'no stage overlap '+name)}
  else {assert.equal(after.stage.width,before.stage.width,'portrait retains video width');assert.equal(after.stage.height,before.stage.height,'portrait retains video height');assert.ok(after.drawer.height<height*.65,'sheet leaves lesson visible')}
  assert.ok(after.drawer.y>=after.headerBottom-1 && after.drawer.x>=0 && after.drawer.x+after.drawer.width<=width+1,'panel in viewport '+name+' '+JSON.stringify(after));
  await capture(name+'-chat.png');
  await click('[data-conversation-tab="captions"]');
  await wait(`document.querySelector('#conversation-captions').hidden===false`);
  assert.ok(await run(`document.querySelector('.classroom-v3-caption-history').clientHeight>=60`),'caption history has reading space '+name);
  await capture(name+'-captions.png');
  measurements.push({name,before,after});
 }
 await win.setContentSize(1440,900);
 await run(`document.querySelector('.classroom-v3-dock button:has(.lucide-monitor-up)').click()`);
 await wait(`!!document.querySelector('.classroom-share-menu')`);
 await run(`document.querySelector('.classroom-share-menu button:has(.lucide-panels-top-left)').click()`);
 await wait(`!!document.querySelector('.classroom-seat-sharing')`);
 assert.equal(await run(`window.fixtureShareOptions.mode`),'portrait');
 assert.equal(await run(`document.querySelectorAll('.classroom-v3-seat.is-sharing').length`),1,'one sharing identity seat');
 await capture('actual-share-portrait.png');
 await win.setContentSize(390,844);await run(`if(!document.querySelector('.classroom-conversation-close'))document.querySelector('.classroom-v3-dock [data-dock-action=chat]').click()`);await wait(`!!document.querySelector('.classroom-conversation-close')`);await wait(`(()=>{const e=document.querySelector('.classroom-seat-sharing'),m=e.closest('.classroom-v3-seat').querySelector('.classroom-v3-seat-media-state');if(!m)return true;const a=e.getBoundingClientRect(),b=m.getBoundingClientRect();return a.top>=b.bottom||a.right<=b.left||a.left>=b.right})()`);await capture('actual-share-mobile-portrait.png');await win.setContentSize(1440,900);
 await run(`document.querySelector('.classroom-v3-dock button[title=共享设置]').click()`);
 await wait(`!!document.querySelector('.classroom-share-corners')`);
 await capture('actual-share-settings.png');
 await run(`document.querySelector('.classroom-share-corners button[aria-label="左上"]').click()`);
 await wait(`window.fixtureShareOptions.corner==='tl'`);
 await run(`document.querySelector('.classroom-v3-dock button[title=共享设置]').click()`);
 await wait(`!!document.querySelector('.classroom-share-menu .is-danger')`);
 await run(`document.querySelector('.classroom-share-menu .is-danger').click()`);
 await wait(`!document.querySelector('.classroom-seat-sharing')`);
 assert.equal(await run(`document.querySelectorAll('.classroom-v3-seat.is-sharing').length`),0);
 if(functionalOnly)await openChat();await click('[data-conversation-tab="chat"]');
 await run(`document.querySelector('.classroom-conversation-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`);
 await wait(`Number(document.querySelector('.classroom-conversation-resizer').getAttribute('aria-valuenow'))===Number(document.querySelector('.classroom-conversation-resizer').getAttribute('aria-valuemax'))`);
 await run(`new Promise(r=>setTimeout(r,150))`);
 const resizeMetrics=await run(`(()=>{const w=document.querySelector('.classroom-v3-workspace').getBoundingClientRect(),d=document.querySelector('.classroom-v3-drawer').getBoundingClientRect(),r=document.querySelector('.classroom-conversation-resizer').getBoundingClientRect();return {width:w.width,drawer:d.width,x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 console.log('RESIZER',resizeMetrics,await run(`document.elementFromPoint(${resizeMetrics.x},${resizeMetrics.y})?.className`));
 assert.ok(resizeMetrics.drawer<=480&&resizeMetrics.drawer<=resizeMetrics.width*.4+1,'right panel protects lesson width');
 win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(resizeMetrics.x),y:Math.round(resizeMetrics.y)});win.webContents.sendInputEvent({type:'mouseDown',x:Math.round(resizeMetrics.x),y:Math.round(resizeMetrics.y),button:'left',clickCount:1});await run(`new Promise(r=>setTimeout(r,50))`);win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(resizeMetrics.x+100),y:Math.round(resizeMetrics.y)});await run(`new Promise(r=>setTimeout(r,50))`);win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(resizeMetrics.x+100),y:Math.round(resizeMetrics.y),button:'left',clickCount:1});
 await wait(`Number(document.querySelector('.classroom-conversation-resizer').getAttribute('aria-valuenow'))<480`);
 assert.ok(await run(`Number(localStorage.getItem('classroom-conversation-width'))>0`));
 await run(`document.querySelector('.classroom-conversation-resizer').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);

 // Switching tabs keeps the composer mounted and preserves unsent work.
 await run(`(()=>{const input=document.querySelector('.classroom-v3-chat-form textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'尚未发送的草稿');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await click('[data-conversation-tab="captions"]');await click('[data-conversation-tab="chat"]');
 assert.equal(await run(`document.querySelector('.classroom-v3-chat-form textarea').value`),'尚未发送的草稿');
 // Chinese composition and Shift+Enter do not send; failures restore the same retry key.
 const setDraft=async value=>run(`(()=>{const input=document.querySelector('.classroom-v3-chat-form textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await setDraft('输入法测试与失败重试');
 await run(`document.querySelector('.classroom-v3-chat-form textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));document.querySelector('.classroom-v3-chat-form textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}))`);
 assert.equal(await run(`window.fixtureLastSend`),undefined);
 await run(`window.fixtureFailSend=true;document.querySelector('.classroom-v3-chat-form').requestSubmit()`);
 await wait(`!!document.querySelector('.classroom-chat-send-error')`);
 assert.equal(await run(`document.querySelector('.classroom-v3-chat-form textarea').value`),'输入法测试与失败重试');
 const failedKey=await run(`fixtureLastSend.clientMessageId`);
 await run(`window.fixtureFailSend=false;document.querySelector('.classroom-v3-chat-form').requestSubmit()`);
 await wait(`!document.querySelector('.classroom-chat-send-error') && !document.querySelector('.classroom-v3-chat-form').getAttribute('aria-busy').includes('true')`);
 assert.equal(await run(`fixtureLastSend.clientMessageId`),failedKey);
 assert.equal(await run(`Array.from(document.querySelectorAll('.classroom-v3-message-list article > p')).filter(e=>e.textContent==='输入法测试与失败重试').length`),1);
 // Editing/pointing at the whiteboard must not dismiss an anchored conversation.
 await run(`document.querySelector('.classroom-v3-stage').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
 assert.ok(await run(`!!document.querySelector('.classroom-conversation-close')`));
 // Network recovery retrieves messages immediately even with a healthy-looking RTM connection.
 const recoveryBefore=await run(`({requests:fixtureStats.requests.length,recoveries:fixtureStats.recoveries,rtm:fixtureStats.signalingConnections})`);
 await run(`window.fixturePayload.messages.push({...window.fixturePayload.messages[0],id:'after-network',content:'网络恢复后补回的消息'});window.dispatchEvent(new Event('online'))`);
 await wait(`document.querySelector('.classroom-v3-message-list').textContent.includes('网络恢复后补回的消息') && fixtureStats.recoveries>${recoveryBefore.recoveries} && fixtureStats.signalingConnections>${recoveryBefore.rtm}`);
 const resumeRequests=await run(`fixtureStats.requests.slice(${recoveryBefore.requests})`);
 assert.ok(resumeRequests.some(p=>p.endsWith('/messages')));assert.ok(resumeRequests.some(p=>p.endsWith('/state')));
 // A reader in history keeps their position when a real-time message arrives.
 await run(`const history=document.querySelector('.classroom-v3-message-list');history.scrollTop=0;history.dispatchEvent(new Event('scroll'));fixturePayload.messages.push({...fixturePayload.messages[0],id:'next-message',content:'新消息不会打断历史阅读'});window.fixtureReceive({courseId:'fixture-session',topic:'messages',revision:fixturePayload.runtime.revision},'teacher:tab')`);
 await wait(`!!document.querySelector('.classroom-chat-latest')`);
 assert.equal(await run(`document.querySelector('.classroom-v3-message-list').scrollTop`),0);
 await click('.classroom-chat-latest');
 assert.ok(await run(`(()=>{const e=document.querySelector('.classroom-v3-message-list');return e.scrollHeight-e.scrollTop-e.clientHeight<5})()`));
 // Keyboard navigation and focus.
 await run(`document.querySelector('[data-conversation-tab=chat]').focus();document.querySelector('[data-conversation-tab=chat]').dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}))`);
 assert.equal(await run(`document.activeElement.dataset.conversationTab`),'captions');
 // A failed signaling rebuild retries independently while polling stays available.
 const rtmBefore=await run(`fixtureStats.signalingConnections`);
 await run(`window.fixtureRTMFailNext=true;window.fixtureHealth(false)`);
 for(let attempt=0;attempt<450;attempt++){
  if(await run(`fixtureStats.signalingConnections>=${rtmBefore+2} && fixtureStats.rtmReady`))break;
  if(attempt===449)throw Error('RTM failed reconnect did not retry');
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 // Header overflow uses a portal, remains visible, and changes language live.
 await run(`document.querySelector('.classroom-header-more').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}))`);
 await wait(`!!document.querySelector('.classroom-header-menu [role=menuitem]')`);await capture('wide-more-menu.png');
 await run(`document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape'}))`);
 // Course and settings menus use anchored portals with keyboard-accessible submenus.
 await run(`document.querySelector('.classroom-minimal-course').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}))`);await wait(`!!document.querySelector('.classroom-course-menu')`);await capture('actual-course-menu.png');await run(`document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape'}))`);
 await run(`document.querySelector('.classroom-minimal-settings').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}))`);await wait(`!!document.querySelector('.classroom-quick-settings')`);await capture('actual-settings-menu.png');
 await run(`(()=>{const e=[...document.querySelectorAll('.classroom-quick-settings [role=menuitem]')].find(e=>e.textContent.includes('语言'));e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'ArrowRight'}))})()`);await wait(`[...document.querySelectorAll('[role=menuitemradio]')].some(e=>e.textContent==='English')`);await capture('actual-language-menu.png');await run(`[...document.querySelectorAll('[role=menuitemradio]')].find(e=>e.textContent==='English').click()`);await wait(`document.querySelector('.classroom-minimal-course').textContent.includes('算法') && document.querySelector('.classroom-header-more').getAttribute('aria-label').startsWith('More')`);
 const phases=[];for(const [phase,tone] of [['waiting','neutral'],['ready','warning'],['live','active'],['overtime','warning'],['closing','danger'],['ended','neutral']]){await win.loadURL(url+'&role=teacher&phase='+phase);await wait(`document.querySelector('.classroom-lesson-clock')?.dataset.phase==='${phase}'`);const state=await run(`(()=>{const c=document.querySelector('.classroom-lesson-clock'),h=document.querySelector('.classroom-v3-topbar');return {phase:c.dataset.phase,tone:c.dataset.tone,color:getComputedStyle(c).color,text:c.textContent,header:getComputedStyle(h).backgroundColor,background:getComputedStyle(document.querySelector('.classroom-v3-shell')).backgroundColor,warning:!!document.querySelector('.classroom-minimal-connection-warning')}})()`);assert.equal(state.tone,tone);assert.equal(state.header,'rgb(255, 255, 255)');assert.equal(state.background,'rgb(245, 245, 247)');if(phase==='live')assert.equal(state.color,'rgb(67, 56, 202)');if(phase==='overtime')assert.equal(state.color,'rgb(133, 83, 8)');if(phase==='closing')assert.equal(state.color,'rgb(175, 38, 61)');if(phase==='ended')assert.equal(state.warning,false);phases.push(state);await capture('actual-phase-'+phase+'.png')}
 if(!functionalOnly)await fs.writeFile(path.join(output,'lifecycle-ui.json'),JSON.stringify({passed:true,phases,evidence:'Actual React page with server-time HTTP fixture'},null,2));
 await win.setContentSize(390,844);await capture('phone-tab-switch.png');
 await run(`document.documentElement.className='dark'`);await capture('phone-dark.png');
 if(!functionalOnly) await fs.writeFile(path.join(output,'ui-result.json'),JSON.stringify({passed:true,boundaries:'Actual ClassroomV3 React UI; HTTP, RTC, RTM, translation and whiteboard are simulated. No production or physical-device acceptance.',measurements,resumeRequests},null,2));
 // A standalone interactive review uses the real compiled components with fixture data.
 if(!functionalOnly) await fs.writeFile(path.join(output,'preview.js'),bundle.outputFiles.find(file=>file.path.endsWith('.js')).text);
 if(!functionalOnly) await fs.writeFile(path.join(output,'preview.css'),css);
 if(!functionalOnly) await fs.writeFile(path.join(output,'preview.html'),'<!doctype html><html lang="zh-CN" class="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>课堂交互设计预览（模拟数据）</title><link rel="stylesheet" href="preview.css"><style>.fixture-board{height:100%;background:white;padding:32px;color:#243449;font-size:20px}.fixture-board h2{font-size:32px;font-weight:700;margin-bottom:24px}.fixture-board p{margin-block:16px}</style><div id="root"></div><script src="preview.js"></script></html>');
 console.log(functionalOnly ? 'PASS functional classroom: IME-safe Enter, multiline input, send failure content/key retention, history follow, network catch-up and failed RTM reconnect retry.' : 'PASS responsive classroom: 7 viewport sizes, chat/caption switching, draft retention, history position, keyboard tabs, immediate network resync, RTM reconnect. Media and HTTP are simulated.');
}
app.whenReady().then(main).then(()=>{win?.destroy();server?.close();app.quit()}).catch(error=>{console.error(error);win?.destroy();server?.close();app.exit(1)});
