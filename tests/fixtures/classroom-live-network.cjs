// Disposable local data and a loopback HTTP impairment proxy. Never replaces
// identity, authorization, provider credentials or application response bodies.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const workflow=process.env.CLASSIN_TEST_WORKFLOW||'activities';
if(!['activities','workspace-chat'].includes(workflow))throw Error('Unsupported local verification workflow');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'outputs',workflow==='workspace-chat'?'workspace-chat-live-network':'classroom-live-network'),manifest=path.join(output,'fixture.json');
const dbUrl=new URL(process.env.DATABASE_URL||'http://invalid');
if(!['127.0.0.1','localhost','::1'].includes(dbUrl.hostname)||dbUrl.pathname!='/classin_unified_dev'||process.env.CLASSIN_TEST_CLASSROOM!=='1')throw Error('Requires the disposable local classroom test workflow');
const {prisma}=require('../../src/lib/db');

async function ownedFixture(){const f=JSON.parse(await fs.readFile(manifest,'utf8'));const course=await prisma.course.findUniqueOrThrow({where:{id:f.courseId},select:{name:true}});assert.equal(course.name,`临时课堂弱网验收 ${f.runId}`);return f;}
async function prepare(){
 try{await ownedFixture();throw Error('Clean the existing fixture first');}catch(error){if(error.code!=='ENOENT'&&error.code!=='P2025')throw error;}
 const sourceId=process.env.CLASSIN_TEST_SOURCE_COURSE;if(!sourceId)throw Error('Set CLASSIN_TEST_SOURCE_COURSE');
 const source=await prisma.course.findUniqueOrThrow({where:{id:sourceId},select:{ownerId:true,ownerName:true,teacherId:true,teacherName:true,students:{select:{studentId:true,studentName:true,studentAvatar:true},take:1}}});assert.equal(source.students.length,1);
 const runId=crypto.randomUUID();let course;
 try{
  course=await prisma.course.create({data:{name:`临时课堂弱网验收 ${runId}`,ownerId:source.ownerId,ownerName:source.ownerName,teacherId:source.teacherId,teacherName:source.teacherName,status:'live'}});
  await prisma.courseStudent.create({data:{courseId:course.id,...source.students[0]}});
  const session=await prisma.courseSession.create({data:{courseId:course.id,title:'课堂互动弱网与下发范围验收',position:1,roomUuid:crypto.randomUUID(),roomType:4,createdBy:source.ownerId,status:'scheduled',startTime:new Date(Date.now()-60000),endTime:new Date(Date.now()+3600000)}});
  await prisma.classroomRuntime.create({data:{courseId:course.id,sessionId:session.id,recordingStartMode:'disabled',captionStartPreferences:{}}});
  await fs.mkdir(output,{recursive:true});const fixture={runId,workflow,courseId:course.id,sessionId:session.id,url:workflow==='workspace-chat'?`http://localhost:3185/?view=chat&courseId=${course.id}&lang=zh-CN`:`http://localhost:3185/classroom?sessionId=${session.id}&lang=zh-CN`};await fs.writeFile(manifest,JSON.stringify(fixture,null,2));console.log(JSON.stringify({prepared:true,...fixture}));
 }catch(error){if(course)await prisma.course.delete({where:{id:course.id}});throw error;}
}
async function cleanup(){const f=await ownedFixture();const recordings=await prisma.classroomRecording.count({where:{courseId:f.courseId,status:{in:['starting','recording','stopping']}}});assert.equal(recordings,0,'Stop any provider recording before cleanup');const runtime=await prisma.classroomRuntime.findUnique({where:{sessionId:f.sessionId},select:{transcriptionStatus:true}});assert.ok(!runtime||['stopped','failed'].includes(runtime.transcriptionStatus),'Stop captions before cleanup');await prisma.course.delete({where:{id:f.courseId}});assert.equal(await prisma.course.count({where:{id:f.courseId}}),0);await fs.writeFile(path.join(output,'cleanup.json'),JSON.stringify({cleaned:true,courseId:f.courseId},null,2));console.log('PASS disposable class and classroom records removed');}
async function proxy(){
 const f=await ownedFixture(),http=require('node:http'),net=require('node:net'),readline=require('node:readline');
 const directIds=new Set((await prisma.workspaceDirectChat.findMany({where:{courseId:f.courseId},select:{id:true}})).map(row=>row.id));await prisma.$disconnect();
 let rule=null;const events=[],sockets=new Set(),timers=new Set(),prefix=`/api/sessions/${f.sessionId}/classroom/activities`;
 const record=event=>{const value={at:new Date().toISOString(),...event};events.push(value);console.log(JSON.stringify(value));};
 const server=http.createServer((req,res)=>{
  if(!req.url.startsWith('/')){res.writeHead(400);res.end();return;}
  const body=[];req.on('data',chunk=>body.push(chunk));req.on('end',()=>{
   const pathname=req.url.split('?')[0],direct=/^\/api\/workspace\/direct\/([^/]+)\/messages$/.exec(pathname);let payload;try{payload=JSON.parse(Buffer.concat(body));}catch{/* Actual API validates JSON. */}
   const openDirect=workflow==='workspace-chat'&&req.method==='POST'&&pathname==='/api/workspace/direct'&&payload?.courseId===f.courseId;
   const classChat=pathname===`/api/workspace/courses/${f.courseId}/messages`,directChat=direct&&directIds.has(decodeURIComponent(direct[1]));
   const scoped=workflow==='workspace-chat'?openDirect||classChat||directChat:pathname===prefix||req.url.startsWith(prefix+'/');
   let action=workflow==='workspace-chat'?(openDirect?'open-direct':req.method==='POST'?'message':req.method==='GET'?'read':null):req.method==='POST'&&pathname===prefix?'create':null;
   if(scoped&&req.method==='PATCH')action=payload?.action;
   const selected=scoped&&rule&&rule.action===action&&rule.remaining>0?{...rule}:null;if(selected)rule.remaining--;
   const started=Date.now(),headers={...req.headers,'x-forwarded-host':req.headers.host};
   const upstream=http.request({host:'127.0.0.1',port:3000,path:req.url,method:req.method,headers},reply=>{
    const data=[];reply.on('data',chunk=>data.push(chunk));reply.on('end',()=>{
     if(openDirect&&reply.statusCode<300){try{let decoded=Buffer.concat(data);const encoding=reply.headers['content-encoding'];if(encoding==='gzip')decoded=require('node:zlib').gunzipSync(decoded);else if(encoding==='br')decoded=require('node:zlib').brotliDecompressSync(decoded);const created=JSON.parse(decoded);if(typeof created.chat?.id==='string')directIds.add(created.chat.id);}catch{/* A missing registration leaves other conversations unimpaired. */}}
     if(scoped&&action&&req.method!=='GET')record({event:'committed-response',method:req.method,action,channel:workflow==='workspace-chat'?(classChat?'class':openDirect?'direct-open':'direct'):undefined,status:reply.statusCode,upstreamMs:Date.now()-started});
     if(selected?.drop){record({event:'reply-dropped',action,status:reply.statusCode});res.destroy();return;}
     const delay=selected?.delayMs??(scoped?180:0);
     const deliver=()=>{if(res.destroyed)return;res.writeHead(reply.statusCode,reply.headers);res.end(Buffer.concat(data));if(selected)record({event:'held-reply-delivered',action,delayMs:delay});};
     if(delay){if(selected)record({event:'holding-reply',action,delayMs:delay});const timer=setTimeout(()=>{timers.delete(timer);deliver();},delay);timers.add(timer);}else deliver();
    });
   });upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local upstream unavailable');});upstream.end(Buffer.concat(body));
  });
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 server.on('upgrade',(req,socket,head)=>{if(!req.url.startsWith('/_next/')){socket.destroy();return;}const upstream=net.connect(3000,'127.0.0.1',()=>{upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(req.headers).map(([key,value])=>`${key}: ${value}`).join('\r\n')}\r\n\r\n`);if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);});upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3185,'127.0.0.1',resolve);});
 const forwarder=await require('../../scripts/lib/loopback-forwarder.cjs').startLoopbackForwarder(3185);
 record({event:'proxy-ready',port:3185,sessionId:f.sessionId,baseScopedDelayMs:180});
 const input=readline.createInterface({input:process.stdin});input.on('line',line=>{try{const value=JSON.parse(line);if(!['create','answer','release','message','read'].includes(value.action))throw Error('Unsupported action');if(value.drop!==true&&(!Number.isInteger(value.delayMs)||value.delayMs<0||value.delayMs>15000))throw Error('Invalid delay');rule={action:value.action,drop:value.drop===true,delayMs:value.delayMs||0,remaining:1};record({event:'rule-armed',...rule});}catch{record({event:'invalid-control'});}});
 let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;for(const timer of timers)clearTimeout(timer);for(const socket of sockets)socket.destroy();input.close();server.close();await forwarder.close();await fs.writeFile(path.join(output,'proxy-events.json'),JSON.stringify(events,null,2));process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
(process.argv.includes('--proxy')?proxy():process.argv.includes('--cleanup')?cleanup():prepare()).finally(()=>prisma.$disconnect()).catch(error=>{console.error(error.message);process.exitCode=1;});
