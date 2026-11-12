/* eslint-disable @typescript-eslint/no-require-imports -- standalone local database integration test */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..');
const database=new URL(process.env.DATABASE_URL||'');
if(!['127.0.0.1','localhost','::1'].includes(database.hostname)||database.pathname!=='/classin_unified_dev')throw new Error('This test requires the local classin_unified_dev database');
const userId=`folder-fixture-${crypto.randomUUID()}`,otherId=`${userId}-other`;
let api,dir;
(async()=>{
 dir=await fs.mkdtemp(path.join(root,'node_modules/.folder-recovery-'));
 const file=path.join(dir,'test.cjs');
 await esbuild.build({stdin:{contents:'export {prisma} from "@/lib/db"; export {POST} from "@/app/api/workspace/drive/route"; export {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write"; export {parsePendingFolder} from "@/lib/workspace-folder-pending";',resolveDir:root},outfile:file,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'fixture-auth',setup(build){build.onResolve({filter:/^@\/lib\/session$/},()=>({path:'session',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function getSessionFromRequest(request){return {userId:request.headers.get("x-fixture-user")}}',loader:'js'}));}}]});
 api=require(file);
 const requestId=crypto.randomUUID(),body=JSON.stringify({name:'recovery folder',parentId:null});
 let attempts=0;
 const network=async(_path,options)=>{
  const headers=new Headers(options.headers);headers.set('x-fixture-user',userId);
  const response=await api.POST(new Request('http://localhost/api/workspace/drive',{...options,headers}));
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});
  if(++attempts<=2)throw new TypeError('response lost after database commit');
  return data;
 };
 await assert.rejects(api.retryIdempotentWrite('/drive','POST',requestId,body,network),api.UncertainWriteError);
 assert.equal(await api.prisma.workspaceDriveItem.count({where:{userId,requestId}}),1);
 const saved=api.parsePendingFolder(JSON.stringify({requestId,body}),null);
 const confirmed=await api.retryIdempotentWrite('/drive','POST',saved.requestId,saved.body,network);
 assert.equal(confirmed.item.name,'recovery folder');assert.equal(attempts,3);
 assert.equal(await api.prisma.workspaceDriveItem.count({where:{userId,requestId}}),1);
 const call=(who,payload)=>api.POST(new Request('http://localhost/api/workspace/drive',{method:'POST',headers:{'content-type':'application/json','idempotency-key':requestId,'x-fixture-user':who},body:JSON.stringify(payload)}));
 assert.equal((await call(userId,{name:'changed',parentId:null})).status,409);
 const other=await call(otherId,{name:'other account',parentId:null});assert.equal(other.status,201);
 assert.equal(await api.prisma.workspaceDriveItem.count({where:{userId:otherId,requestId}}),1);
 console.log('PASS: committed folder with lost replies is confirmed once; payload conflicts and account isolation hold');
})().finally(async()=>{if(api){await api.prisma.workspaceDriveItem.deleteMany({where:{userId:{in:[userId,otherId]}}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});}).catch(error=>{console.error(error);process.exitCode=1;});
