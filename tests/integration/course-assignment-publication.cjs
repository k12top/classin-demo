/* eslint-disable @typescript-eslint/no-require-imports -- isolated local database integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL||'http://invalid');
if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||url.pathname!=='/classin_unified_dev')throw Error('Requires local workspace database');
let dir,api,courseId;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.assignment-publish-'));
 const stubs={'@/lib/session':'export async function getSessionFromRequest(request){const role=request.headers.get("x-test-role")||"teacher";return {userId:role==="teacher"?"publish-owner":role,name:role,role}}','server-only':''};
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db";export {NextRequest} from "next/server";export {POST} from "@/app/api/courses/[id]/assignments/[draftId]/publish/route";export {GET} from "@/app/api/courses/[id]/published-assignments/route";',resolveDir:root},outfile:path.join(dir,'route.cjs'),bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'identities',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
 api=require(path.join(dir,'route.cjs'));const db=api.prisma;
 const course=await db.course.create({data:{name:'Temporary published assignment',ownerId:'publish-owner',ownerName:'Owner',teacherId:'publish-owner',teacherName:'Owner'}});courseId=course.id;
 await db.courseStudent.create({data:{courseId,studentId:'student',studentName:'Student'}});
 const start=new Date(Date.now()+86400000);await db.courseSession.create({data:{courseId,title:'Authorized lesson',position:1,roomUuid:'assignment-'+crypto.randomUUID(),roomType:4,status:'scheduled',startTime:start,endTime:new Date(+start+3600000),createdBy:'publish-owner'}});
 const unit=await db.courseProgramUnit.create({data:{courseId,creatorId:'publish-owner',requestId:crypto.randomUUID(),name:'Unit'}});
 const draft=await db.courseAssignmentDraft.create({data:{courseId,unitId:unit.id,creatorId:'publish-owner',requestId:crypto.randomUUID(),title:'Original',description:'Instructions'}});
 const key='publish-'+crypto.randomUUID(),ctx={params:Promise.resolve({id:courseId,draftId:draft.id})};
 const publish=(role='teacher',id=key,version=0)=>api.POST(new api.NextRequest('http://localhost/publish',{method:'POST',headers:{'Idempotency-Key':id,'x-test-role':role},body:JSON.stringify({version})}),ctx);
 assert.equal((await publish('student')).status,403);
 const [one,two]=await Promise.all([publish(),publish()]);assert.ok([200,503].includes(one.status));assert.ok([200,503].includes(two.status));
 const retry=await publish();assert.equal(retry.status,200);const saved=(await retry.json()).assignment;assert.equal(saved.title,'Original');
 await db.courseAssignmentDraft.update({where:{id:draft.id},data:{title:'Edited',version:{increment:1}}});assert.equal((await (await publish()).json()).assignment.title,'Original');
 assert.equal((await publish('teacher','other-'+crypto.randomUUID(),1)).status,409);
 const list=(role,query='')=>api.GET(new api.NextRequest('http://localhost/list'+query,{headers:{'x-test-role':role}}),{params:Promise.resolve({id:courseId})});
 assert.equal((await list('outsider')).status,403);const visible=await list('student');assert.equal(visible.status,200);assert.equal((await visible.json()).assignments[0].title,'Original');
 assert.equal((await (await list('student','?unitId=missing')).json()).assignments.length,0);assert.equal((await list('student','?programId=other')).status,403);
 assert.equal(await db.coursePublishedAssignment.count({where:{courseId}}),1);
 console.log('PASS: immutable publication, concurrency, replay and scoped reads');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(api){if(courseId)await api.prisma.course.delete({where:{id:courseId}});await api.prisma.$disconnect()}if(dir)await fs.rm(dir,{recursive:true,force:true})});
