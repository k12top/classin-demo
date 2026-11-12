/* eslint-disable @typescript-eslint/no-require-imports -- isolated local database integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),database=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1','::1'].includes(database.hostname)||database.pathname!=='/classin_unified_dev')throw Error('Requires local classin_unified_dev');
const userId=`event-fixture-${crypto.randomUUID()}`,otherId=`${userId}-other`;let api,dir;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.event-recovery-'));const file=path.join(dir,'test.cjs');
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db";export {POST} from "@/app/api/workspace/events/route";export {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write";export {parsePendingEvent} from "@/lib/workspace-event-pending";',resolveDir:root},outfile:file,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture-auth',setup(build){build.onResolve({filter:/^@\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function getSessionFromRequest(request){return {userId:request.headers.get("x-fixture-user")}}',loader:'js'}));}}]});
 api=require(file);const requestId=crypto.randomUUID(),body=JSON.stringify({title:'recovery event',notes:'',startsAt:'2026-11-01T06:30:00.000Z',endsAt:'2026-11-01T07:30:00.000Z',timeZone:'America/New_York'});let attempts=0;
 const network=async(_path,options)=>{const headers=new Headers(options.headers);headers.set('x-fixture-user',userId);const response=await api.POST(new Request('http://localhost/events',{...options,headers}));const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});if(++attempts<=2)throw new TypeError('response lost after commit');return data;};
 await assert.rejects(api.retryIdempotentWrite('/events','POST',requestId,body,network),api.UncertainWriteError);
 const pending=api.parsePendingEvent(JSON.stringify({requestId,body}));const result=await api.retryIdempotentWrite('/events','POST',pending.requestId,pending.body,network);
 assert.equal(result.event.startsAt,'2026-11-01T06:30:00.000Z');assert.equal(await api.prisma.workspaceEvent.count({where:{userId,requestId}}),1);
 const call=(who,value)=>api.POST(new Request('http://localhost/events',{method:'POST',headers:{'content-type':'application/json','idempotency-key':requestId,'x-fixture-user':who},body:JSON.stringify(value)}));
 assert.equal((await call(userId,{...JSON.parse(body),title:'different'})).status,409);
 assert.equal((await call(otherId,JSON.parse(body))).status,201);
 await api.prisma.workspaceEvent.delete({where:{id:result.event.id}});
 assert.equal((await call(userId,JSON.parse(body))).status,409);assert.equal(await api.prisma.workspaceEvent.count({where:{userId,requestId}}),0);
 const simultaneous=crypto.randomUUID();const parallel=()=>api.POST(new Request('http://localhost/events',{method:'POST',headers:{'content-type':'application/json','idempotency-key':simultaneous,'x-fixture-user':userId},body}));
 const replies=await Promise.all([parallel(),parallel()]);assert.deepEqual(replies.map(item=>item.status),[201,201]);assert.equal(await api.prisma.workspaceEvent.count({where:{userId,requestId:simultaneous}}),1);
 console.log('PASS: real event receipts recover lost responses, scope accounts, reject changed content and prevent recreation after deletion');
})().finally(async()=>{if(api){await api.prisma.workspaceEvent.deleteMany({where:{userId:{in:[userId,otherId]}}});await api.prisma.workspaceEventReceipt.deleteMany({where:{userId:{in:[userId,otherId]}}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});}).catch(error=>{console.error(error);process.exitCode=1;});
