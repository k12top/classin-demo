/* eslint-disable @typescript-eslint/no-require-imports -- isolated local integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),database=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1','::1'].includes(database.hostname)||database.pathname!=='/classin_unified_dev')throw Error('Requires local classin_unified_dev');
const owner=`observer-live-${crypto.randomUUID()}`,viewer=`${owner}-viewer`,old=`${owner}-old`;let api,course,lesson,dir;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.observer-live-'));const file=path.join(dir,'test.cjs');
 const stubs={'server-only':'','next/server':"export {NextRequest,NextResponse} from 'next/server.js';export const after=()=>{};",'@/lib/session':'export async function getSessionFromRequest(r){const userId=r.headers.get("x-fixture-user");return userId?{userId,name:userId,displayName:userId,avatar:"",role:"teacher"}:null}',
 '@/lib/classroom/server/provider-factory':'export const getClassroomServerProvider=()=>({issueCredential:input=>({...input,provider:"agora",rtcUid:123,token:"fixture",publishAllowed:false})});export const getRecordingProvider=()=>({isConfigured:()=>false});',
 '@/lib/classroom/signaling/agora-server':'export const issueAgoraSignalingCredential=()=>null;',
 '@/lib/classroom/server/transcription-orchestrator':'export const classroomInterpretationAvailability=async()=>({});export const syncClassroomTranscription=async()=>{};',
 '@/lib/classroom/whiteboard/provider-factory':'export const getWhiteboardProvider=()=>({});'};
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db";export {NextRequest} from "next/server";export {POST} from "@/app/api/classroom/session/route";export {GET as verify} from "@/app/api/courses/[id]/verify-access/route";export {GET as state} from "@/app/api/courses/[id]/classroom/state/route";',resolveDir:root},outfile:file,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixtures',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js',resolveDir:root}));}}]});
 api=require(file);course=await api.prisma.course.create({data:{name:'observer live test',ownerId:owner,ownerName:owner,teacherId:owner,teacherName:owner}});
 lesson=await api.prisma.courseSession.create({data:{courseId:course.id,position:1,roomUuid:crypto.randomUUID(),roomType:4,title:'Live test',status:'live',startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+3600000),createdBy:owner}});
 await api.prisma.courseSessionTeacher.createMany({data:[viewer,old].map(id=>({courseId:course.id,sessionId:lesson.id,teacherId:id,teacherName:id,role:'observer',action:'include'}))});
 const runtime=await api.prisma.classroomRuntime.create({data:{courseId:course.id,sessionId:lesson.id,status:'live'}});
 await api.prisma.classroomMemberState.create({data:{courseId:course.id,sessionId:lesson.id,runtimeId:runtime.id,userId:`org/${old.toUpperCase()}`,role:'student',cameraAllowed:true,whiteboardWritable:true}});
 const verify=who=>api.verify(new api.NextRequest(`http://localhost/api/courses/${course.id}/verify-access?sessionId=${lesson.id}`,{headers:{'x-fixture-user':who}}),{params:Promise.resolve({id:course.id})});
 const allowed=await (await verify(viewer)).json();assert.equal(allowed.allowed,true);assert.equal(allowed.role,'observer');
 const denied=await (await verify(old)).json();assert.equal(denied.allowed,false);assert.equal(denied.code,'observer_previous_participant');
 const outsider=await (await verify(`${owner}-outsider`)).json();assert.equal(outsider.allowed,false);
 const joined=await api.POST(new Request('http://localhost/api/classroom/session',{method:'POST',headers:{'content-type':'application/json','x-fixture-user':viewer},body:JSON.stringify({sessionId:lesson.id,clientId:'observer-live-client',deviceId:'observer-live-device'})}));assert.equal(joined.status,200);
 const data=await joined.json();assert.equal(data.credential.role,'observer');assert.equal(data.credential.publisher,false);assert.equal(data.credential.publishAllowed,false);assert.ok(Object.values(data.capabilities).every(value=>value===false));
 const member=await api.prisma.classroomMemberState.findUniqueOrThrow({where:{sessionId_userId:{sessionId:lesson.id,userId:viewer}}});assert.equal(member.role,'observer');assert.equal(member.whiteboardWritable,false);assert.equal(member.cameraAllowed,false);
 const state=()=>api.state(new api.NextRequest(`http://localhost/state?scope=runtime`,{headers:{'x-fixture-user':viewer}}),{params:Promise.resolve({id:lesson.id})});
 const before=await state();assert.equal(before.status,200);assert.equal((await before.json()).viewerRole,'observer');
 await api.prisma.courseSessionTeacher.deleteMany({where:{sessionId:lesson.id,teacherId:viewer}});assert.equal((await (await verify(viewer)).json()).allowed,false);
 assert.equal((await state()).status,403);
 await api.prisma.courseSessionStudent.create({data:{courseId:course.id,sessionId:lesson.id,studentId:viewer,studentName:viewer,action:'include'}});
 const changed=await state();assert.equal(changed.status,200);assert.equal((await changed.json()).viewerRole,'student');
 console.log('PASS: real observer roster grants subscriber-only entry, rejects old identities and reflects revocation; media and login use fixtures');
})().finally(async()=>{if(api){if(lesson)await api.prisma.classroomConnection.deleteMany({where:{sessionId:lesson.id}});if(course)await api.prisma.course.delete({where:{id:course.id}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});}).catch(error=>{console.error(error);process.exitCode=1;});
