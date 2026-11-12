// Explicit local-only cloud media verification. Never uses a production database.
// Checkpoint: prepare/cleanup, syntax and lint verified. Real provider recording,
// recorder bridge and caption delivery still require end-to-end verification.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),esbuild=require('esbuild');
require('dotenv').config({path:['.env.local','env.local'],quiet:true});
const root=path.resolve(__dirname,'../..'),output=path.join(root,'outputs/cloud-recording-live'),manifest=path.join(output,'fixture.json');
const dbUrl=new URL(process.env.DATABASE_URL||'http://invalid');
if(!['127.0.0.1','localhost','::1'].includes(dbUrl.hostname)||dbUrl.pathname!='/classin_unified_dev'||process.env.CLASSIN_TEST_CLOUD_RECORDING!=='1')throw Error('Requires CLASSIN_TEST_CLOUD_RECORDING=1 and local classin_unified_dev');
let api;
async function services(){
 const cache=path.join(root,'node_modules/.cache/cloud-recording-live');await fs.mkdir(cache,{recursive:true});
 const file=path.join(cache,'services.cjs');
 await esbuild.build({stdin:{contents:`export{prisma}from'@/lib/db';export{getClassroomServerProvider}from'@/lib/classroom/server/provider-factory';export{applyClassroomAction}from'@/lib/classroom/server/runtime';export{requestRecordingStart,processRecordingStart,requestRecordingStop,processRecordingStop,reconcileRecordingAttempt}from'@/lib/classroom/server/recording-orchestrator';export{syncClassroomTranscription,stopClassroomTranscription}from'@/lib/classroom/server/transcription-orchestrator';export{ingestClassroomCaption}from'@/lib/classroom/server/captions';export{getAliyunOssClient}from'@/lib/aliyun-oss';`,resolveDir:root},outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'server-context',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'',loader:'js'}));}}]});
 return api=require(file);
}
async function owned(){const f=JSON.parse(await fs.readFile(manifest,'utf8'));assert.match(f.runId,/^[a-f0-9-]{36}$/);const course=await api.prisma.course.findUniqueOrThrow({where:{id:f.courseId},select:{name:true}});assert.equal(course.name,`临时云录制验收（合成音视频）${f.runId}`);assert.equal(await api.prisma.courseSession.count({where:{id:f.sessionId,courseId:f.courseId}}),1);return f;}
async function prepare(){
 try{await owned();throw Error('Clean the existing fixture first');}catch(error){if(error.code!=='ENOENT'&&error.code!=='P2025')throw error;}
 const sourceId=process.env.CLASSIN_TEST_SOURCE_COURSE;if(!sourceId)throw Error('Set CLASSIN_TEST_SOURCE_COURSE');
 const source=await api.prisma.course.findUniqueOrThrow({where:{id:sourceId},select:{ownerId:true,ownerName:true,teacherId:true,teacherName:true,students:{select:{studentId:true,studentName:true,studentAvatar:true},take:1}}});
 const tunnel=(await fs.readFile('/tmp/classin-recorder-tunnel.log','utf8')).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);assert.ok(tunnel,'Start the temporary recorder tunnel first');
 const dotenv=require('dotenv'),local=dotenv.parse(await fs.readFile(path.join(root,'.env.local'))),shared=dotenv.parse(await fs.readFile('/Users/will/Project/环境变量/.env.classroom'));
 const changed=['CLASSROOM_RECORDER_SECRET','CLASSROOM_PUBLIC_BASE_URL'],before=Object.fromEntries(changed.map(key=>[key,local[key]??null]));
 const runId=crypto.randomUUID(),recorderSecret=crypto.randomBytes(32).toString('base64url'),controlToken=crypto.randomBytes(32).toString('base64url');
 let course;
 try{
  course=await api.prisma.course.create({data:{name:`临时云录制验收（合成音视频）${runId}`,ownerId:source.ownerId,ownerName:source.ownerName,teacherId:source.teacherId,teacherName:source.teacherName,status:'live'}});
  if(source.students.length)await api.prisma.courseStudent.create({data:{courseId:course.id,...source.students[0]}});
  const lesson=await api.prisma.courseSession.create({data:{courseId:course.id,title:'合成音视频云录制与字幕回放验证',position:1,roomUuid:crypto.randomUUID(),roomType:4,createdBy:source.ownerId,status:'scheduled',startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+30*60000)}});
  await api.prisma.classroomRuntime.create({data:{courseId:course.id,sessionId:lesson.id,recordingStartMode:'classStart',sourceLanguage:'en-US',captionStartPreferences:{autoCaptions:true,autoInterpretation:false,sourceLanguage:'en-US',targetLanguages:[]}}});
  const fixture={runId,courseId:course.id,sessionId:lesson.id,channelName:lesson.roomUuid,teacher:{userId:source.teacherId||source.ownerId,name:source.teacherName||source.ownerName,displayName:source.teacherName||source.ownerName,avatar:''},publicOrigin:tunnel[0],recorderSecret,controlToken,cookieToken:crypto.randomBytes(32).toString('base64url'),before,expiresAt:Date.now()+20*60000,url:`http://localhost:3000/courses/${course.id}/playback?sessionId=${lesson.id}&lang=en`};
  await fs.mkdir(output,{recursive:true});await fs.writeFile(manifest,JSON.stringify(fixture,null,2),{mode:0o600});
  Object.assign(local,{CLASSROOM_RECORDER_SECRET:recorderSecret,CLASSROOM_PUBLIC_BASE_URL:tunnel[0]});
  if(!local.AGORA_RECORDING_STORAGE_REGION)local.AGORA_RECORDING_STORAGE_REGION=shared.AGORA_RECORDING_STORAGE_REGION;
  assert.ok(local.AGORA_RECORDING_STORAGE_REGION,'Missing recording storage region');
  await fs.writeFile(path.join(root,'.env.local'),Object.entries(local).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600});
  console.log(JSON.stringify({prepared:true,courseId:course.id,sessionId:lesson.id,url:fixture.url,publicOrigin:fixture.publicOrigin}));
 }catch(error){if(course)await api.prisma.course.delete({where:{id:course.id}});throw error;}
}
async function start(f){
 await api.applyClassroomAction({courseId:f.courseId,sessionId:f.sessionId,session:f.teacher,role:'teacher',action:{type:'startClass'}});
 const transcription=await api.syncClassroomTranscription(f.courseId,{sessionId:f.sessionId});
 console.log(JSON.stringify({transcription:transcription.transcriptionStatus,error:transcription.transcriptionError||null}));
 const row=await api.requestRecordingStart(f.courseId,f.sessionId);
 const started=await api.processRecordingStart(row.id);
 console.log(JSON.stringify({recordingId:row.id,status:started?.status,mode:started?.mode,failureStage:started?.failureStage,error:started?.errorMessage}));
}
async function stop(f){
 const now=new Date();await api.prisma.courseSession.update({where:{id:f.sessionId},data:{status:'finished',endedAt:now}});
 await api.prisma.classroomRuntime.update({where:{sessionId:f.sessionId},data:{status:'ended'}});
 await api.stopClassroomTranscription(f.courseId,f.sessionId);
 for(const row of await api.prisma.classroomRecording.findMany({where:{sessionId:f.sessionId}})){
  if(row.status!=='completed'){await api.requestRecordingStop(row);await api.processRecordingStop(row.id);}
 }
 await inspect(f);
}
async function inspect(f){
 const runtime=await api.prisma.classroomRuntime.findUnique({where:{sessionId:f.sessionId},select:{status:true,transcriptionStatus:true,transcriptionError:true}});
 const recordings=await api.prisma.classroomRecording.findMany({where:{sessionId:f.sessionId}});
 const captions=await api.prisma.classroomCaption.findMany({where:{sessionId:f.sessionId},orderBy:{occurredAt:'asc'},select:{id:true,text:true,isFinal:true,occurredAt:true},take:12});
 const result={at:new Date().toISOString(),runtime,recordings:recordings.map(r=>({id:r.id,status:r.status,mode:r.mode,startedAt:r.startedAt,stoppedAt:r.stoppedAt,failureStage:r.failureStage,error:r.errorMessage,files:Array.isArray(r.files)?r.files.length:0,hasPlayback:Boolean(r.playbackObjectKey),exitConfirmed:Boolean(r.providerState?.stopControl?.confirmedAt)})),captions};
 await fs.writeFile(path.join(output,'latest-state.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));return result;
}
async function cleanup(f){
 const rows=await api.prisma.classroomRecording.findMany({where:{sessionId:f.sessionId}});
 for(const r of rows){assert.ok(!['starting','recording','stopping'].includes(r.status),'Stop the real provider task before cleanup');assert.ok(r.providerState?.stopControl?.confirmedAt||r.status==='failed'&&!r.providerSessionId&&r.failureStage!=='start-unknown','Provider exit remains unverified');}
 const runtime=await api.prisma.classroomRuntime.findUnique({where:{sessionId:f.sessionId}});assert.ok(!runtime?.transcriptionAgentId,'Stop transcription before cleanup');
 const oss=api.getAliyunOssClient();let objects=0;
 for(const r of rows){const parts=r.providerState?.fileNamePrefix;assert.ok(Array.isArray(parts)&&parts.includes(f.sessionId),'Refusing an unrelated storage prefix');const prefix=parts.join('/')+'/';assert.ok(prefix.length>50&&!prefix.includes('..'));
  let marker;do{const result=await oss.list({prefix,'max-keys':1000,...(marker?{marker}:{})});for(const obj of result.objects||[]){assert.ok(obj.name.startsWith(prefix));await oss.delete(obj.name);objects++;}marker=result.isTruncated?result.nextMarker:null;}while(marker);
 }
 await api.prisma.course.delete({where:{id:f.courseId}});
 const dotenv=require('dotenv'),local=dotenv.parse(await fs.readFile(path.join(root,'.env.local')));
 for(const [key,previous] of Object.entries(f.before))if(local[key]===(key==='CLASSROOM_RECORDER_SECRET'?f.recorderSecret:f.publicOrigin)){if(previous===null)delete local[key];else local[key]=previous;}
 await fs.writeFile(path.join(root,'.env.local'),Object.entries(local).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n',{mode:0o600});
 await fs.writeFile(path.join(output,'cleanup.json'),JSON.stringify({cleaned:true,courseId:f.courseId,objectsDeleted:objects,environmentRestored:true},null,2));console.log('PASS disposable cloud media data and recorder environment removed');
}
async function serve(f){
 const http=require('node:http'),{jwtVerify}=await import('jose'),events=[];
 const writeEvent=event=>{events.push({at:new Date().toISOString(),...event});};
 const authorized=async value=>{
  try{const {payload}=await jwtVerify(String(value?.recorderToken||''),new TextEncoder().encode(f.recorderSecret),{algorithms:['HS256']});if(payload.scope!=='classroom-recorder'||payload.courseId!==f.sessionId||typeof payload.recordingId!=='string'||value.sessionId!==f.sessionId&&value.courseId!==f.sessionId)return false;
   return Boolean(await api.prisma.classroomRecording.count({where:{id:payload.recordingId,sessionId:f.sessionId,mode:'web'}}));
  }catch{return false;}
 };
 const postPaths=new Set(['/api/classroom/session','/api/classroom/session/renew-credential','/api/classroom/session/whiteboard-credential','/api/classroom/recorder/state','/api/classroom/recorder/ready','/api/classroom/connection-diagnostics']);
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture');const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
  try{
   if(Date.now()>f.expiresAt)return reply(410,{error:'Fixture expired'});
   if(req.method==='GET'&&url.pathname==='/__fixture_health')return reply(200,{ready:true});
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>256*1024)return reply(413,{error:'Too large'});chunks.push(chunk);}const raw=Buffer.concat(chunks);
   let setCookie=false,allowed=false;
   if(req.method==='GET'&&url.pathname==='/classroom/recorder'){allowed=await authorized({sessionId:url.searchParams.get('sessionId')||url.searchParams.get('courseId'),recorderToken:url.searchParams.get('recorderToken')});setCookie=allowed;}
   else if(req.method==='POST'&&postPaths.has(url.pathname)){let body;try{body=JSON.parse(raw);}catch{return reply(400,{error:'Invalid JSON'});}allowed=await authorized(body);}
   else if(req.method==='GET'&&url.pathname.startsWith('/_next/static/')&&!url.pathname.includes('..'))allowed=(req.headers.cookie||'').split(';').some(cookie=>cookie.trim()===`classin_recorder_fixture=${f.cookieToken}`);
   if(!allowed)return reply(404,{error:'Not found'});
   const headers={host:req.headers.host,'content-type':req.headers['content-type']||'application/json',...(req.headers.origin?{origin:req.headers.origin}:{}),'accept-encoding':'identity'};
   const upstream=http.request({host:'127.0.0.1',port:3000,path:req.url,method:req.method,headers},response=>{
    const safeHeaders={...response.headers};delete safeHeaders['set-cookie'];if(setCookie)safeHeaders['set-cookie']=`classin_recorder_fixture=${f.cookieToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1200`;
    res.writeHead(response.statusCode,safeHeaders);response.pipe(res);writeEvent({path:url.pathname,status:response.statusCode});
   });upstream.on('error',()=>reply(502,{error:'Local upstream unavailable'}));upstream.end(raw);
  }catch{if(!res.headersSent)reply(503,{error:'Recorder bridge unavailable'});else res.destroy();}
 });
 const control=http.createServer(async(req,res)=>{
  if(req.headers['x-fixture-control']!==f.controlToken){res.writeHead(401);res.end();return;}
  try{
   if(req.url==='/credential'){const credential=api.getClassroomServerProvider().issueCredential({channelName:f.channelName,userId:f.teacher.userId,role:'teacher',publisher:true,allowScreenShare:false,allowAuxiliaryCamera:false});res.setHeader('content-type','application/json');res.end(JSON.stringify(credential));return;}
   if(req.url==='/caption'&&req.method==='POST'){const data=[];for await(const chunk of req)data.push(chunk);const caption=JSON.parse(Buffer.concat(data));await api.ingestClassroomCaption(f.courseId,{...caption,speakerName:'Synthetic audio source'},f.sessionId);res.end('ok');return;}
   res.writeHead(404);res.end();
  }catch(error){res.writeHead(500);res.end('Fixture operation failed');console.error(error.message);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3186,'127.0.0.1',resolve);});await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(3187,'127.0.0.1',resolve);});
 console.log(JSON.stringify({bridgeReady:true,port:3186,localControlPort:3187,publicOrigin:f.publicOrigin}));
 let closing=false;const close=async()=>{if(closing)return;closing=true;clearTimeout(timer);server.closeAllConnections();control.closeAllConnections();server.close();control.close();await fs.writeFile(path.join(output,'bridge-events.json'),JSON.stringify(events,null,2));await api.prisma.$disconnect();process.exit(0);};
 const timer=setTimeout(()=>{void stop(f).finally(close);},Math.max(1000,f.expiresAt-Date.now()));process.once('SIGINT',close);process.once('SIGTERM',close);
 await new Promise(()=>{});
}
(async()=>{await services();if(process.argv.includes('--prepare'))return prepare();const f=await owned();if(process.argv.includes('--serve'))return serve(f);if(process.argv.includes('--start'))return start(f);if(process.argv.includes('--stop'))return stop(f);if(process.argv.includes('--cleanup'))return cleanup(f);return inspect(f);})().finally(()=>api?.prisma.$disconnect()).catch(error=>{console.error(error.message);process.exitCode=1;});
