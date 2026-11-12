/* eslint-disable @typescript-eslint/no-require-imports -- isolated local database integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),database=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1','::1'].includes(database.hostname)||database.pathname!=='/classin_unified_dev')throw Error('Requires local classin_unified_dev');
const actor=`attendance-fixture-${crypto.randomUUID()}`;let api,course,dir;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.attendance-access-'));const file=path.join(dir,'test.cjs');
 const stubs={'server-only':'','@/lib/session':'export async function getSessionFromRequest(request){const userId=request.headers.get("x-fixture-user");return {userId,name:userId,role:"teacher"}}'};
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db";export {NextRequest} from "next/server";export {GET} from "@/app/api/courses/[id]/attendance/route";',resolveDir:root},outfile:file,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture-auth',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
 api=require(file);course=await api.prisma.course.create({data:{name:'isolated attendance',ownerId:actor,ownerName:actor,teacherId:actor,teacherName:actor}});
 const create=position=>api.prisma.courseSession.create({data:{courseId:course.id,title:`lesson ${position}`,position,roomUuid:crypto.randomUUID(),roomType:4,status:'scheduled',startTime:new Date(Date.now()+86400000),endTime:new Date(Date.now()+90000000),createdBy:actor,leadTeacherId:`${actor}-lead`,leadTeacherName:'Lesson lead'}});
 const observed=await create(1),teaching=await create(2);
 await api.prisma.courseSessionTeacher.create({data:{courseId:course.id,sessionId:observed.id,teacherId:actor,teacherName:actor,action:'include',role:'observer'}});
 const get=id=>api.GET(new api.NextRequest(`http://localhost/attendance?sessionId=${id}`,{headers:{'x-fixture-user':actor}}),{params:Promise.resolve({id:course.id})});
 assert.equal((await get(observed.id)).status,403);assert.equal((await get('nonexistent')).status,404);assert.equal((await get(teaching.id)).status,200);
 console.log('PASS: real lesson roster blocks attendance for an observer and permits a different teaching lesson');
})().finally(async()=>{if(api){if(course)await api.prisma.course.delete({where:{id:course.id}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});}).catch(error=>{console.error(error);process.exitCode=1;});
