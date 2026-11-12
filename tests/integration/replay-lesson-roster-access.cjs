// Real PostgreSQL, effective rosters and replay routes. Login and storage delivery are isolated boundaries.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL||'http://invalid');
if(!['127.0.0.1','localhost','::1'].includes(url.hostname)||url.pathname!='/classin_unified_dev')throw Error('Requires local classin_unified_dev');
let api,temp,group;const courses=[],prefix='replay-roster-'+crypto.randomUUID(),owner=prefix+'-owner',direct=prefix+'-direct',inGroup=prefix+'-group',temporary=prefix+'-temporary',observer=prefix+'-observer',assistant=prefix+'-assistant';
(async()=>{
 temp=await fs.mkdtemp(path.join(root,'node_modules/.replay-roster-'));const file=path.join(temp,'routes.cjs');
 const mocks={
  '@/lib/session':'export async function getSessionFromRequest(request){const userId=request.headers.get("x-fixture-user");return userId?{userId,name:userId,displayName:userId,avatar:"",role:"student"}:null}',
  '@/lib/aliyun-oss':'export class CoursewareStorageConfigurationError extends Error{};export function getCoursewareOssClient(){return{signatureUrl(){globalThis.__replayFixtureSigns++;return "https://example.invalid/fixture.mp4"}}};export const getAliyunOssClient=getCoursewareOssClient;',
  '@/lib/courseware-file-response':'export async function coursewareFileResponse(){globalThis.__replayFixtureFiles++;return new Response("fixture file")}',
  'server-only':'',
 };
 await esbuild.build({stdin:{contents:'export{prisma}from"@/lib/db";export{NextRequest}from"next/server";export{resolveCoursewareAccess as access}from"@/lib/courseware-access";export{GET as recordings}from"@/app/api/sessions/[sessionId]/recordings/route";export{GET as play}from"@/app/api/sessions/[sessionId]/recordings/[recordingId]/play/route";export{GET as summary}from"@/app/api/sessions/[sessionId]/summary/route";export{GET as messages}from"@/app/api/sessions/[sessionId]/replay-messages/route";export{GET as download}from"@/app/api/courses/[id]/courseware/[coursewareId]/download/route";',resolveDir:root},outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'boundaries',setup(build){build.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'fixture'}:undefined);build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}));}}]});
 api=require(file);globalThis.__replayFixtureSigns=0;globalThis.__replayFixtureFiles=0;const db=api.prisma;
 const course=await db.course.create({data:{name:'isolated replay roster test',ownerId:owner,ownerName:owner,teacherId:owner,teacherName:owner}});courses.push(course.id);
 const foreign=await db.course.create({data:{name:'isolated other class',ownerId:owner,ownerName:owner,teacherId:owner,teacherName:owner}});courses.push(foreign.id);
 await db.courseStudent.create({data:{courseId:course.id,studentId:direct}});
 group=await db.studentGroup.create({data:{name:prefix,createdBy:owner}});await db.groupMember.create({data:{groupId:group.id,userId:inGroup}});await db.courseGroupLink.create({data:{courseId:course.id,groupId:group.id}});
 async function lesson(courseId,position,studentMode='inherit'){return db.courseSession.create({data:{courseId,position,studentMode,title:'isolated replay lesson',status:'finished',createdBy:owner,roomUuid:crypto.randomUUID(),roomType:4,startTime:new Date(Date.now()-3600000),endTime:new Date(Date.now()-60000)}});}
 const first=await lesson(course.id,1),second=await lesson(course.id,2,'custom'),foreignLesson=await lesson(foreign.id,1);
 await db.courseSessionStudent.createMany({data:[{courseId:course.id,sessionId:first.id,studentId:temporary,action:'include'},{courseId:course.id,sessionId:second.id,studentId:temporary,action:'include'}]});
 await db.courseSessionTeacher.createMany({data:[{courseId:course.id,sessionId:first.id,teacherId:observer,role:'observer'},{courseId:course.id,sessionId:first.id,teacherId:assistant,role:'assistant'}]});
 const recording=await db.classroomRecording.create({data:{courseId:course.id,sessionId:first.id,provider:'agora',channelName:'fixture',recorderUserId:'fixture',status:'completed',playbackFormat:'mp4',playbackObjectKey:`fixture/${prefix}/clip.mp4`,startedAt:first.startTime,stoppedAt:first.endTime}});
 const material=await db.courseware.create({data:{courseId:course.id,sessionId:first.id,name:'fixture.pdf',ext:'pdf',url:'oss://fixture-only',studentCanView:true,studentCanDownload:true}});
 function request(user,suffix=''){return new api.NextRequest('http://localhost/replay'+suffix,{headers:user?{'x-fixture-user':user}:{}});}
 const call=(route,user)=>api[route](request(user,route==='summary'?'?summaryOnly=1':''),{params:Promise.resolve({sessionId:first.id,recordingId:recording.id})});
 const download=user=>api.download(request(user,`?sessionId=${first.id}`),{params:Promise.resolve({id:course.id,coursewareId:material.id})});
 for(const user of [direct,inGroup,temporary,observer,assistant,owner]){
  for(const route of ['recordings','play','summary','messages']){const res=await call(route,user);assert.ok(res.status===200||route==='play'&&res.status===307,`${route} ${user} ${res.status}`);}
  assert.equal((await download(user)).status,200);
 }
 for(const user of [direct,inGroup])assert.equal((await api.access({userId:user,name:user},course.id,second.id)).allowed,false,'custom roster rejects inherited class membership');
 await db.courseSessionStudent.createMany({data:[direct,inGroup].map(studentId=>({courseId:course.id,sessionId:first.id,studentId,action:'exclude'}))});
 const signsBefore=globalThis.__replayFixtureSigns,filesBefore=globalThis.__replayFixtureFiles;
 for(const user of [direct,inGroup]){
  assert.equal((await api.access({userId:user,name:user},course.id)).allowed,true,'class library membership remains intact');
  for(const route of ['recordings','play','summary','messages'])assert.equal((await call(route,user)).status,403,route+' must respect lesson exclusion');
  assert.equal((await download(user)).status,403);
 }
 assert.equal(globalThis.__replayFixtureSigns,signsBefore,'excluded request cannot mint a signed media URL');assert.equal(globalThis.__replayFixtureFiles,filesBefore,'excluded request cannot deliver a file');
 // Current roster is read on every call, without retaining an earlier grant.
 await db.courseSessionStudent.deleteMany({where:{sessionId:first.id,studentId:temporary}});await db.courseSessionTeacher.deleteMany({where:{sessionId:first.id,teacherId:{in:[observer,assistant]}}});
 for(const user of [temporary,observer,assistant])for(const route of ['recordings','play','summary','messages'])assert.equal((await call(route,user)).status,403,route+' must observe revocation');
 assert.equal((await call('recordings',owner)).status,200,'class teacher retains management access');
 assert.equal((await api.access({userId:direct,name:direct},course.id,foreignLesson.id)).allowed,false);
 assert.equal((await api.access({userId:owner,name:owner},course.id,foreignLesson.id)).allowed,false,'even the class teacher cannot pair a foreign lesson with this class');
 assert.equal((await call('recordings',null)).status,401);
 console.log('PASS real direct/group/custom lesson rosters, excluded media/list/summary/chat/file access, no storage delivery after denial, revocation, observer/assistant scopes, class teacher and cross-class binding');
})().finally(async()=>{if(api){await api.prisma.course.deleteMany({where:{id:{in:courses}}});if(group)await api.prisma.studentGroup.delete({where:{id:group.id}});assert.equal(await api.prisma.course.count({where:{id:{in:courses}}}),0);await api.prisma.$disconnect();}if(temp)await fs.rm(temp,{recursive:true,force:true});delete globalThis.__replayFixtureSigns;delete globalThis.__replayFixtureFiles;}).catch(error=>{console.error(error);process.exitCode=1;});
