// Real loopback PostgreSQL and route/roster/credit logic; only login identity is a fixture.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL||'http://invalid');
if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||url.pathname!='/classin_unified_dev')throw Error('Requires local classin_unified_dev');
let api,temp;const courses=[],prefix='playback-'+crypto.randomUUID(),owner=prefix+'-owner',student=prefix+'-student',temporary=prefix+'-temporary',assistant=prefix+'-assistant',observer=prefix+'-observer',outsider=prefix+'-outsider';
(async()=>{
 temp=await fs.mkdtemp(path.join(root,'node_modules/.playback-lessons-'));const file=path.join(temp,'routes.cjs');
 const identity='export async function getSessionFromRequest(request){const userId=request.headers.get("x-fixture-user");return userId?{userId,name:userId,displayName:userId,avatar:"",role:"student"}:null}';
 await esbuild.build({stdin:{contents:'export{POST,PATCH,GET}from"@/app/api/courses/[id]/playback-progress/route";export{NextRequest}from"next/server";export{prisma}from"@/lib/db";',resolveDir:root},outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'identity-only',setup(build){build.onResolve({filter:/^@\/lib\/session$/},()=>({path:'identity',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:identity,loader:'js'}));}}]});
 api=require(file);const db=api.prisma;
 async function course(status='live',recordUrl=null){const c=await db.course.create({data:{name:'isolated lesson playback',ownerId:owner,ownerName:owner,teacherId:owner,teacherName:owner,status,recordUrl}});courses.push(c.id);return c;}
 const c=await course(),foreign=await course(),legacy=await course('finished','https://example.invalid/legacy.mp4');
 for(const id of [c.id,legacy.id])await db.courseStudent.create({data:{courseId:id,studentId:student,studentName:student}});
 async function lesson(courseId,position,status='finished'){return db.courseSession.create({data:{courseId,position,status,title:'isolated playback lesson',createdBy:owner,roomUuid:crypto.randomUUID(),roomType:4,startTime:new Date(Date.now()-3600000),endTime:new Date(Date.now()-60000)}});}
 const first=await lesson(c.id,1),second=await lesson(c.id,2),noMedia=await lesson(c.id,3),live=await lesson(c.id,4,'live'),foreignLesson=await lesson(foreign.id,1);
 for(const item of [first,second,live])await db.classroomRecording.create({data:{courseId:c.id,sessionId:item.id,provider:'agora',channelName:'fixture',recorderUserId:'fixture',status:'completed',playbackFormat:'mp4',playbackObjectKey:`fixture/${prefix}/${item.id}.mp4`,startedAt:item.startTime,stoppedAt:item.endTime}});
 await db.courseSessionStudent.create({data:{courseId:c.id,sessionId:first.id,studentId:temporary,action:'include'}});
 await db.courseSessionTeacher.create({data:{courseId:c.id,sessionId:first.id,teacherId:assistant,role:'assistant'}});
 await db.courseSessionTeacher.create({data:{courseId:c.id,sessionId:first.id,teacherId:observer,role:'observer'}});
 const request=async(method,user,courseId,body,origin='http://localhost')=>api[method](new api.NextRequest(`http://localhost/api/courses/${courseId}/playback-progress`,{method,headers:{...(user?{'x-fixture-user':user}:{}),origin,'host':'localhost','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({id:courseId})});
 const start=(user,lessonId,courseId=c.id)=>request('POST',user,courseId,{...(lessonId!==undefined?{lessonId}:{}),positionSec:0,playbackRate:1});
 assert.equal((await start(null,first.id)).status,401);assert.equal((await start(outsider,first.id)).status,403);
 assert.equal((await request('POST',student,c.id,{lessonId:first.id,positionSec:0,playbackRate:1},'https://other.invalid')).status,403);
 assert.equal((await start(student,foreignLesson.id)).status,404);assert.equal((await start(student,null)).status,400);
 assert.equal((await start(student,noMedia.id)).status,409);assert.equal((await start(student,live.id)).status,409);
 assert.equal((await start(temporary,second.id)).status,403);assert.equal((await start(temporary,undefined,legacy.id)).status,403,'lesson-only student cannot inherit legacy recording');
 for(const user of [owner,assistant,observer]){const r=await start(user,first.id);assert.equal(r.status,200);assert.equal((await r.json()).tracked,false);assert.equal(await db.coursePlaybackProgress.count({where:{courseId:c.id,studentId:user}}),0);}
 const started=await start(temporary,first.id);assert.equal(started.status,200);const token=await started.json();assert.equal(token.tracked,true);
 const key={courseId_studentId:{courseId:c.id,studentId:temporary}};
 assert.equal((await db.coursePlaybackProgress.findUniqueOrThrow({where:key})).playbackLessonId,first.id);
 const beat=(user,auth,state='playing',positionSec=15,extra={})=>request('PATCH',user,c.id,{sessionId:auth.sessionId,challenge:auth.challenge,state,activeWindow:true,positionSec,playbackRate:1,...extra});
 await db.coursePlaybackProgress.update({where:key,data:{lastHeartbeatAt:new Date(Date.now()-15000)}});
 const credited=await beat(temporary,token,'playing',15,{lessonId:second.id});assert.equal(credited.status,200);const next=await credited.json();assert.ok(next.creditedSec>=14&&next.creditedSec<=16);
 assert.equal((await db.coursePlaybackProgress.findUniqueOrThrow({where:key})).playbackLessonId,first.id,'heartbeat cannot retarget its saved lesson');
 assert.equal((await beat(temporary,token,'playing',16)).status,409,'old nonce cannot replay credit');
 assert.equal((await beat(student,{...token,challenge:next.challenge})).status,409,'other student cannot use this watch session');
 await db.courseSessionStudent.deleteMany({where:{sessionId:first.id,studentId:temporary}});
 const before=(await db.coursePlaybackProgress.findUniqueOrThrow({where:key})).totalDurationSec;
 assert.equal((await beat(temporary,{...token,challenge:next.challenge},'paused',15)).status,403,'revocation rejects the next heartbeat');
 assert.equal((await db.coursePlaybackProgress.findUniqueOrThrow({where:key})).totalDurationSec,before);
 // Explicit lesson exclusions override a student's inherited class membership.
 await db.courseSessionStudent.create({data:{courseId:c.id,sessionId:first.id,studentId:student,action:'exclude'}});
 assert.equal((await start(student,first.id)).status,403);assert.equal((await start(student,second.id)).status,200);
 const legacyStart=await start(student,undefined,legacy.id);assert.equal(legacyStart.status,200);assert.equal((await legacyStart.json()).tracked,true);
 assert.equal((await db.coursePlaybackProgress.findUniqueOrThrow({where:{courseId_studentId:{courseId:legacy.id,studentId:student}}})).playbackLessonId,null);
 assert.equal((await request('GET',student,c.id)).status,403);const report=await request('GET',owner,c.id);assert.equal(report.status,200);assert.ok((await report.json()).playback.some(row=>row.studentId===temporary&&row.totalDurationSec===before));
 console.log('PASS lesson recording without legacy URL, inherited/temporary roles, exclusions, revocation, nonce binding, server credit, preview, report and legacy compatibility');
})().finally(async()=>{if(api){await api.prisma.course.deleteMany({where:{id:{in:courses}}});assert.equal(await api.prisma.course.count({where:{id:{in:courses}}}),0);await api.prisma.$disconnect();}if(temp)await fs.rm(temp,{recursive:true,force:true});}).catch(error=>{console.error(error);process.exitCode=1;});
