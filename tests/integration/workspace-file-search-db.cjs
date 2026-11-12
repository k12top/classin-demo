/* eslint-disable @typescript-eslint/no-require-imports -- isolated PostgreSQL route acceptance. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),esbuild=require('esbuild');
const {NextRequest}=require('next/server');
(async()=>{
 const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL||'http://invalid');
 if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/activities')throw Error('Requires disposable activities database');
 const file=path.join(root,'node_modules/.cache/activity-acceptance',`drive-search-${crypto.randomUUID()}.cjs`);let db;
 try{
  await esbuild.build({stdin:{contents:'export {GET} from "@/app/api/workspace/drive/search/route";export {prisma} from "@/lib/db";',resolveDir:root},outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'identity',setup(build){build.onResolve({filter:/^@\/lib\/session$/},()=>({path:'identity',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function getSessionFromRequest(request){const userId=request.headers.get("x-fixture-user");return userId?{userId}:null;}',loader:'js'}));}}]});
  const route=require(file);db=route.prisma;
  const item=(userId,name,status='ready',kind='file')=>({userId,name,status,kind,requestId:crypto.randomUUID(),objectKey:`private/${crypto.randomUUID()}`,size:99});
  await db.workspaceDriveItem.createMany({data:[item('owner','Lesson notes.pdf'),item('other','Lesson other.pdf'),item('owner','Lesson pending.pdf','pending'),item('owner','Lesson deleted.pdf','trashed'),item('owner','Lesson folder','ready','folder'),item('owner','Unrelated.pdf')]});
  const request=(user,q='lesson')=>route.GET(new NextRequest(`http://localhost/api/workspace/drive/search?q=${encodeURIComponent(q)}&userId=other`,{headers:user?{'x-fixture-user':user}:{}}));
  assert.equal((await request(null)).status,401);
  const response=await request('owner');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const own=await response.json();assert.deepEqual(own.files.map(f=>f.name),['Lesson notes.pdf']);assert.equal(own.hasMore,false);assert.deepEqual(Object.keys(own.files[0]).sort(),['id','name','size']);
  assert.deepEqual((await (await request('other')).json()).files.map(f=>f.name),['Lesson other.pdf']);
  await db.workspaceDriveItem.createMany({data:Array.from({length:21},(_,i)=>item('owner',`Limit ${i}.txt`))});
  const limited=await (await request('owner','LIMIT')).json();assert.equal(limited.files.length,20);assert.equal(limited.hasMore,true);
  console.log('PASS real PostgreSQL file search: account isolation, status/kind filtering, case-insensitive names, metadata only and 20-match bound; identity controlled');
 }finally{if(db)await db.$disconnect();await fs.rm(file,{force:true});}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
