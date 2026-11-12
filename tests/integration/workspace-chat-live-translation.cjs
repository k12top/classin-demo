/* eslint-disable @typescript-eslint/no-require-imports -- opt-in live translation integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL||'http://invalid');
if(process.env.RUN_LIVE_TRANSLATION_TEST!=='1'||!['localhost','127.0.0.1','::1'].includes(url.hostname)||url.pathname!=='/classin_unified_dev')throw Error('Requires opt-in and isolated local database');
let dir,api,courseId;
(async()=>{dir=await fs.mkdtemp(path.join(root,'node_modules/.translation-route-'));
 const stubs={'@/lib/session':`export async function getSessionFromRequest(r){const id=r.headers.get('x-test-user');return id?{userId:id,name:id,displayName:id,role:'teacher'}:null}`, 'server-only':''};
 const source=`export {prisma} from '@/lib/db';export {NextRequest} from 'next/server';export {POST as send} from '@/app/api/workspace/courses/[id]/messages/route';export {POST as translate} from '@/app/api/workspace/courses/[id]/messages/translate/route';`;
 await esbuild.build({stdin:{contents:source,resolveDir:root},outfile:path.join(dir,'test.cjs'),bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'identity',setup(build){build.onResolve({filter:/.*/},({path:id})=>id in stubs?{path:id,namespace:'stub'}:undefined);build.onLoad({filter:/.*/,namespace:'stub'},({path:id})=>({contents:stubs[id],loader:'js'}));}}]});
 api=require(path.join(dir,'test.cjs'));const db=api.prisma;const course=await db.course.create({data:{name:'Synthetic translation test',ownerId:'owner',ownerName:'Owner',teacherId:'owner',teacherName:'Owner'}});courseId=course.id;
 const req=(user,body)=>new api.NextRequest('http://localhost/test',{method:'POST',headers:{'x-test-user':user,'content-type':'application/json'},body:JSON.stringify(body)}),ctx={params:Promise.resolve({id:courseId})};
 const posted=await api.send(req('owner',{content:'你好，欢迎来到课堂。',clientId:'synthetic-translation-001'}),ctx);assert.equal(posted.status,201);const id=(await posted.json()).message.id;
 assert.equal((await api.translate(req('outsider',{messageIds:[id],language:'en-US'}),ctx)).status,403);
 const response=await api.translate(req('owner',{messageIds:[id],language:'en-US'}),ctx);assert.equal(response.status,200);const translations=(await response.json()).translations;assert.ok(typeof translations[id]==='string'&&translations[id].trim());
 console.log('PASS real translation service with synthetic course message and access check');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(api){if(courseId)await api.prisma.course.delete({where:{id:courseId}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});});
