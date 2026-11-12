/* eslint-disable @typescript-eslint/no-require-imports -- isolated local database integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL||'http://invalid');
if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||url.pathname!=='/classin_unified_dev')throw Error('Requires local workspace database');
let dir,api,courseId;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.resource-rename-access-'));
 const stubs={'@/lib/session':`export async function getSessionFromRequest(r){const id=r.headers.get('x-test-user');return id?{userId:id,name:id,role:id==='student'?'student':'teacher'}:null}`,'server-only':''};
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db";export {GET,PATCH} from "@/app/api/courses/[id]/resources/[resourceId]/route";',resolveDir:root},outfile:path.join(dir,'test.cjs'),bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'identity',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
 api=require(path.join(dir,'test.cjs'));const db=api.prisma;
 const course=await db.course.create({data:{name:'Resource permission test',ownerId:'owner',ownerName:'Owner',teacherId:'owner',teacherName:'Owner'}});courseId=course.id;
 await db.courseStudent.create({data:{courseId,studentId:'student',studentName:'Student'}});
 const start=new Date(Date.now()+86400000);await db.courseSession.create({data:{courseId,title:'Lesson',position:1,roomUuid:crypto.randomUUID(),roomType:4,status:'scheduled',startTime:start,endTime:new Date(+start+3600000),createdBy:'owner'}});
 const resource=await db.courseProgramResource.create({data:{courseId,creatorId:'owner',requestId:crypto.randomUUID(),sourceId:'source',sourceObjectKey:'source-key',objectKey:`test/${crypto.randomUUID()}`,name:'before.pdf',size:10,status:'ready'}});
 const ctx={params:Promise.resolve({id:courseId,resourceId:resource.id})};
 const get=user=>api.GET(new Request('http://localhost/resource',{headers:user?{'x-test-user':user}:{}}),ctx);
 const rename=(user,name,previousName)=>api.PATCH(new Request('http://localhost/resource',{method:'PATCH',headers:{'content-type':'application/json','x-test-user':user},body:JSON.stringify({name,previousName})}),ctx);
 assert.equal((await get(null)).status,401);assert.equal((await get('student')).status,404);assert.equal((await get('other-teacher')).status,404);
 assert.equal((await rename('student','after.pdf','before.pdf')).status,404);assert.equal((await rename('owner','after.pdf','before.pdf')).status,200);
 const current=await get('owner');assert.equal(current.status,200);assert.equal(current.headers.get('cache-control'),'private, no-store');assert.equal((await current.json()).resource.name,'after.pdf');
 assert.equal((await rename('owner','again.pdf','before.pdf')).status,409);
 await db.courseProgramResource.update({where:{id:resource.id},data:{status:'removed'}});assert.equal((await get('owner')).status,404);
 console.log('PASS: real database rename verification and manager, student, outsider and removed-resource boundaries');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(api){if(courseId)await api.prisma.course.delete({where:{id:courseId}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});});
