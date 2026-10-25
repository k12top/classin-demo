/* Real Next route + Prisma services. Only authenticated actor and private object storage are fixtures. */
const path=require('node:path'),fs=require('node:fs/promises'),esbuild=require('esbuild');
const {NextRequest}=require('next/server');
const {openHarness}=require('./activity-harness.cjs');
async function openChatHarness(){
 const h=await openHarness(),root=path.resolve(__dirname,'../..');
 for(const userId of ['teacher','assistant'])await h.db.classroomMemberState.create({data:{runtimeId:h.runtime.id,courseId:h.course.id,sessionId:h.lesson.id,userId,displayName:userId,role:userId,presence:'online'}});
 global.__chatFixture={courseId:h.course.id,sessionId:h.lesson.id,objects:new Map()};
 const entries={images:'src/app/api/sessions/[sessionId]/classroom/images/route.ts',image:'src/app/api/sessions/[sessionId]/classroom/messages/[messageId]/image/route.ts',messages:'src/app/api/courses/[id]/classroom/messages/route.ts',activities:'src/app/api/sessions/[sessionId]/classroom/activities/route.ts',activity:'src/app/api/sessions/[sessionId]/classroom/activities/[activityId]/route.ts',draft:'src/app/api/sessions/[sessionId]/classroom/activities/draft/route.ts'};
 const entry=Object.entries(entries).map(([name,file])=>`export * as ${name} from ${JSON.stringify(path.join(root,file))};`).join('\n');
 const output=path.join(root,'node_modules/.cache/activity-acceptance/chat-routes.cjs');
 await esbuild.build({stdin:{contents:entry,resolveDir:root},outfile:output,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json'),plugins:[{name:'boundaries',setup(build){
 build.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
 build.onResolve({filter:/^@\/lib\/classroom\/server\/(request-access|chat-images)$/},args=>({path:args.path.split('/').at(-1),namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'ts',resolveDir:root,contents:args.path==='empty'?'':args.path==='request-access'?`export async function resolveClassroomRequestAccess(request,id){const f=globalThis.__chatFixture,userId=request.headers.get('x-fixture-user')||request.cookies.get('fixture-user')?.value;if(!['teacher','assistant','student','student2'].includes(userId))return {ok:false,status:401,error:'Unauthorized'};if(![f.courseId,f.sessionId].includes(id))return {ok:false,status:403,error:'Wrong lesson'};return {ok:true,session:{userId,name:userId,displayName:userId},access:{courseId:f.courseId,sessionId:f.sessionId,role:['teacher','assistant'].includes(userId)?userId:'student'}}}`:`import * as actual from ${JSON.stringify(path.join(root,'src/lib/classroom/server/chat-images.ts'))}; const store={put:async(k,v)=>globalThis.__chatFixture.objects.set(k,Buffer.from(v)),get:async k=>globalThis.__chatFixture.objects.get(k),delete:async k=>globalThis.__chatFixture.objects.delete(k)};export const chatImageForm=actual.chatImageForm;export const saveChatImage=(a,id,input)=>actual.saveChatImage(a,id,input,store);export const readChatImageObject=k=>actual.readChatImageObject(k,store);`}));
 }}]});
 const routes=require(output);
 async function request(user,method,pathname,body){
  const headers={'x-fixture-user':user};let data=body;
  if(body&&!(body instanceof FormData)){headers['content-type']='application/json';data=JSON.stringify(body)}
  const req=new NextRequest('http://127.0.0.1'+pathname,{method,headers,...(data?{body:data}:{})});
  return dispatch(req);
 }
 async function dispatch(req){const p=req.nextUrl.pathname,sessionId=h.lesson.id;let route,params;
  if(p===`/api/sessions/${sessionId}/classroom/images`){route=routes.images;params={sessionId}}
  else if(p===`/api/courses/${h.course.id}/classroom/messages`){route=routes.messages;params={id:h.course.id}}
  else if(p===`/api/sessions/${sessionId}/classroom/activities/draft`){route=routes.draft;params={sessionId}}
  else if(p===`/api/sessions/${sessionId}/classroom/activities`){route=routes.activities;params={sessionId}}
  else if(p.startsWith(`/api/sessions/${sessionId}/classroom/activities/`)){route=routes.activity;params={sessionId,activityId:p.split('/').at(-1)}}
  else if(p.startsWith(`/api/sessions/${sessionId}/classroom/messages/`)&&p.endsWith('/image')){route=routes.image;params={sessionId,messageId:p.split('/').at(-2)}}
  if(!route?.[req.method])return new Response('Missing test route',{status:404});
  return route[req.method](req,{params:Promise.resolve(params)});
 }
 return {...h,routes,request,dispatch,base:`/api/sessions/${h.lesson.id}/classroom`,messagesPath:`/api/courses/${h.course.id}/classroom/messages`};
}
module.exports={openChatHarness};
