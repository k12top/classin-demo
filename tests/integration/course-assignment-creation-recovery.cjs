/* eslint-disable @typescript-eslint/no-require-imports -- isolated local database integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL||'http://invalid');
if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||url.pathname!=='/classin_unified_dev')throw Error('Requires local workspace database');
let dir,api,courseId;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.assignment-recovery-'));
 const stubs={'@/lib/session':'export async function getSessionFromRequest(){return {userId:"assignment-fixture",role:"teacher"}}','@/lib/course-teacher':'export async function assertCanTeachCourse(){return true}'};
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db"; export {NextRequest} from "next/server"; export {POST} from "@/app/api/courses/[id]/assignments/route";',resolveDir:root},outfile:path.join(dir,'route.cjs'),bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'identities',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
 api=require(path.join(dir,'route.cjs'));const db=api.prisma;
 const course=await db.course.create({data:{name:'Temporary assignment recovery',ownerId:'assignment-fixture',ownerName:'Owner',teacherId:'assignment-fixture',teacherName:'Owner'}});courseId=course.id;
 const key='assignment-'+crypto.randomUUID(),payload={title:'Original',description:'Content',dueDate:null,programId:null,unitId:null},ctx={params:Promise.resolve({id:courseId})};
 const submit=body=>api.POST(new api.NextRequest('http://localhost/draft',{method:'POST',headers:{'Idempotency-Key':key,'X-Assignment-Recovery':'1'},body:JSON.stringify(body)}),ctx);
 const [first,second]=await Promise.all([submit(payload),submit(payload)]);assert.ok([200,201].includes(first.status));assert.ok([200,201].includes(second.status));const id=(await first.json()).draft.id;assert.equal((await second.json()).draft.id,id);
 await db.courseAssignmentDraft.update({where:{id},data:{title:'Edited',version:{increment:1}}});const changed=await submit(payload);assert.equal(changed.status,200);assert.equal((await changed.json()).draft.title,'Edited');
 assert.equal((await submit({...payload,title:'Other'})).status,409);
 await db.courseAssignmentDraft.delete({where:{id}});const deleted=await submit(payload);assert.deepEqual(await deleted.json(),{draft:null,deleted:true});
 const legacy=await api.POST(new api.NextRequest('http://localhost/draft',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(payload)}),ctx);assert.equal(legacy.status,410);
 assert.equal(await db.courseAssignmentDraft.count({where:{courseId}}),0);assert.equal(await db.courseAssignmentCreationReceipt.count({where:{courseId}}),1);
 console.log('PASS: concurrent creation and replay after edit or deletion');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(api){if(courseId)await api.prisma.course.delete({where:{id:courseId}});await api.prisma.$disconnect()}if(dir)await fs.rm(dir,{recursive:true,force:true})});
