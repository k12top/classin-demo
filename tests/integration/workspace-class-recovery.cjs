/* eslint-disable @typescript-eslint/no-require-imports -- standalone local database integration test */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),dbUrl=new URL(process.env.DATABASE_URL||'');
if(!['127.0.0.1','localhost','::1'].includes(dbUrl.hostname)||dbUrl.pathname!=='/classin_unified_dev')throw new Error('Requires local classin_unified_dev');
const actor=`class-fixture-${crypto.randomUUID()}`,other=`${actor}-other`;let api,dir;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.class-recovery-'));const file=path.join(dir,'test.cjs');
 const stubs={'@/lib/session':'export async function getSessionFromRequest(r){const userId=r.headers.get("x-fixture-user");return {userId,name:userId,displayName:userId,avatar:"",role:"teacher"}}',"server-only":''};
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db";export {POST} from "@/app/api/courses/route";export {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write";export {parsePendingClass} from "@/lib/workspace-class-pending";',resolveDir:root},outfile:file,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture-boundaries',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
 api=require(file);const requestId=crypto.randomUUID(),body=JSON.stringify({name:'isolated class recovery',description:'',roomType:4,courseKind:'series',startTime:'2030-01-01T10:00:00.000Z',endTime:'2030-01-01T11:00:00.000Z',timezone:'Asia/Shanghai'});let attempts=0;
 const network=async(_path,options)=>{const headers=new Headers(options.headers);headers.set('x-fixture-user',actor);const response=await api.POST(new Request('http://localhost/api/courses',{...options,headers}));const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});if(++attempts<=2)throw new TypeError('response lost after commit');return data;};
 await assert.rejects(api.retryIdempotentWrite('/api/courses','POST',requestId,body,network),api.UncertainWriteError);
 assert.equal(await api.prisma.course.count({where:{ownerId:actor,creationRequestId:requestId}}),1);
 const saved=api.parsePendingClass(JSON.stringify({requestId,body}));const result=await api.retryIdempotentWrite('/api/courses','POST',saved.requestId,saved.body,network);
 assert.equal(attempts,3);assert.equal(await api.prisma.courseSession.count({where:{courseId:result.course.id}}),1);
 const call=(who,payload,key=requestId)=>api.POST(new Request('http://localhost/api/courses',{method:'POST',headers:{'content-type':'application/json','idempotency-key':key,'x-fixture-user':who},body:JSON.stringify(payload)}));
 assert.equal((await call(actor,{...JSON.parse(body),description:'different'})).status,409);
 const cross=await call(other,JSON.parse(body));assert.equal(cross.status,409);assert.equal((await cross.json()).course,undefined);
 await api.prisma.course.delete({where:{id:result.course.id}});assert.equal((await call(actor,JSON.parse(body))).status,409);
 const parallelId=crypto.randomUUID(),parallelBody={name:'isolated parallel class',description:'',roomType:4,courseKind:'series'};
 const parallel=()=>call(actor,parallelBody,parallelId);const responses=await Promise.all([parallel(),parallel()]);assert.deepEqual(responses.map(response=>response.status).sort(),[200,201]);
 assert.ok([200,201].includes((await parallel()).status));assert.equal(await api.prisma.course.count({where:{ownerId:actor,creationRequestId:parallelId}}),1);
 const legacyId=crypto.randomUUID();await api.prisma.course.create({data:{name:'old class',ownerId:actor,ownerName:actor,teacherId:actor,teacherName:actor,creationRequestId:legacyId}});
 assert.equal((await call(other,{name:'old class',description:'',roomType:4,courseKind:'series'},legacyId)).status,409);
 assert.equal((await call(actor,{name:'old class',description:'',roomType:4,courseKind:'series'},legacyId)).status,409);
 console.log('PASS: class recovery, payload and account binding, deleted and legacy records, and concurrent requests');
})().finally(async()=>{if(api){await api.prisma.course.deleteMany({where:{ownerId:{in:[actor,other]}}});await api.prisma.courseCreationReceipt.deleteMany({where:{actorId:{in:[actor,other]}}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});}).catch(error=>{console.error(error);process.exitCode=1;});
