/* eslint-disable @typescript-eslint/no-require-imports -- isolated local database integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),dbUrl=new URL(process.env.DATABASE_URL||'');
if(process.env.CLASSIN_TEST_OSS!=='1')throw new Error('Set CLASSIN_TEST_OSS=1 to permit isolated OSS test objects');
if(!['127.0.0.1','localhost','::1'].includes(dbUrl.hostname)||dbUrl.pathname!=='/classin_unified_dev')throw new Error('Requires local classin_unified_dev');
const actor=`resource-fixture-${crypto.randomUUID()}`,other=`${actor}-other`;let api,dir,course,oss,sourceKey,destinationKey,parallelKey;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.resource-recovery-'));const file=path.join(dir,'test.cjs');
 const stubs={'@/lib/session':'export async function getSessionFromRequest(r){const userId=r.headers.get("x-fixture-user");return {userId,name:userId,displayName:userId,avatar:"",role:"teacher"}}','@/lib/course-program-resource':'export async function resourceAccess(){return {allowed:true,canManage:true}};export function programResourceKey(c,u,r){return `test/${c}/${u}/${r}`};export const resourceSelect={id:true}', 'server-only':''};
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db";export {getCoursewareOssClient} from "@/lib/aliyun-oss";export {POST} from "@/app/api/courses/[id]/resources/route";export {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write";export {parsePendingResource,pendingResourceKey} from "@/lib/course-resource-pending";',resolveDir:root},outfile:file,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture-boundaries',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
 api=require(file);course=await api.prisma.course.create({data:{name:'isolated resource recovery',ownerId:actor,ownerName:actor,teacherId:actor,teacherName:actor}});
 oss=api.getCoursewareOssClient();sourceKey=`codex-verification/${actor}/source.pdf`;await oss.put(sourceKey,Buffer.from('isolated resource test'));
 const source=await api.prisma.workspaceDriveItem.create({data:{userId:actor,requestId:crypto.randomUUID(),kind:'file',name:'lesson.pdf',size:22,objectKey:sourceKey}});
 const requestId=crypto.randomUUID(),body=JSON.stringify({sourceId:source.id,name:'lesson.pdf',programId:null,unitId:null}),scope={userId:actor,courseId:course.id,programId:null,unitId:null};let attempts=0;destinationKey=`test/${course.id}/${actor}/${requestId}`;
 const call=(who,payload,key=requestId)=>api.POST(new Request(`http://localhost/api/courses/${course.id}/resources`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':key,'x-fixture-user':who},body:payload}),{params:Promise.resolve({id:course.id})});
 const network=async(_url,options)=>{const response=await call(actor,options.body,options.headers['Idempotency-Key']);const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});if(++attempts<=2)throw new TypeError('response lost after commit');return data;};
 await assert.rejects(api.retryIdempotentWrite('/unused','POST',requestId,body,network),api.UncertainWriteError);
 assert.equal(await api.prisma.courseProgramResource.count({where:{courseId:course.id,creatorId:actor,requestId}}),1);
 const pending=api.parsePendingResource(JSON.stringify({requestId,body}),scope),result=await api.retryIdempotentWrite('/unused','POST',pending.requestId,pending.body,network);
 assert.equal(attempts,3);assert.equal(result.resource.status,'ready');assert.equal((await oss.get(destinationKey)).content.toString(),'isolated resource test');
 assert.equal((await call(actor,JSON.stringify({...JSON.parse(body),name:'changed.pdf'}))).status,409);
 assert.equal((await call(other,body)).status,404);assert.notEqual(api.pendingResourceKey(scope),api.pendingResourceKey({...scope,userId:other}));
 const parallelId=crypto.randomUUID();parallelKey=`test/${course.id}/${actor}/${parallelId}`;
 const files=api.prisma.workspaceDriveItem,originalFind=files.findFirst.bind(files);let arrived=0,release;
 const bothRead=new Promise(resolve=>{release=resolve;});
 files.findFirst=async args=>{const result=await originalFind(args);if(args.where?.id===source.id){arrived++;if(arrived===2)release();await bothRead;}return result;};
 let parallel;try{parallel=await Promise.all([call(actor,body,parallelId),call(actor,body,parallelId)]);}finally{files.findFirst=originalFind;}
 assert.equal(arrived,2);assert.deepEqual(parallel.map(r=>r.status),[201,201]);
 assert.equal(await api.prisma.courseProgramResource.count({where:{courseId:course.id,creatorId:actor,requestId:parallelId}}),1);
 assert.equal((await oss.get(parallelKey)).content.toString(),'isolated resource test');

 console.log('PASS: real OSS copy and bytes, concurrent creation, lost responses, unchanged input and owner isolation');
})().finally(async()=>{const keys=[destinationKey,parallelKey,sourceKey].filter(Boolean);const cleanup=oss?await Promise.allSettled(keys.map(key=>oss.delete(key))):[];const verification=oss?await Promise.allSettled(keys.map(async key=>{try{await oss.head(key);}catch(error){if(error.status===404||error.code==='NoSuchKey')return;throw error;}throw new Error('Test object remains after cleanup');})):[];if(api){if(course)await api.prisma.course.delete({where:{id:course.id}});await api.prisma.workspaceDriveItem.deleteMany({where:{userId:{in:[actor,other]}}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});if([...cleanup,...verification].some(result=>result.status==='rejected'))throw new Error('Failed to delete or verify an isolated OSS test object');}).catch(error=>{console.error(error);process.exitCode=1;});
