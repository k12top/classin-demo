/* eslint-disable @typescript-eslint/no-require-imports -- Real isolated PostgreSQL acceptance. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),esbuild=require('esbuild');
const {NextRequest}=require('next/server');
const {openHarness}=require('./activity-harness.cjs');
(async()=>{
 const h=await openHarness(),{api,db,actor}=h;let routeFile,messageRouteFile;
 try{
  const live=await api.replayPreviewStudents(actor('teacher'));
  assert.equal(live.live,true);assert.deepEqual(live.students,[]);
  const quiz={title:'Preview roster',kind:'quiz',definition:{questions:[{id:'q',type:'single',prompt:'Question',points:1,options:[{id:'a',text:'A'},{id:'b',text:'B'}],correct:['a']}]}};
  const activity=await api.createActivity(actor('teacher'),quiz,crypto.randomUUID(),true);
  await api.commandActivity(actor('student'),activity.id,{action:'answer',expectedVersion:0,answers:{q:['a']}});
  await api.commandActivity(actor('student2'),activity.id,{action:'answer',expectedVersion:0,answers:{q:['b']}});
  await db.classroomMemberState.create({data:{runtimeId:h.runtime.id,courseId:h.course.id,sessionId:h.lesson.id,userId:'student3',displayName:'student3',role:'student',presence:'online'}});
  await db.classroomActivitySubmission.create({data:{activityId:activity.id,userId:'former',displayName:'Former student',answers:{q:['b']},grading:{q:0}}});
  await api.commandActivity(actor('teacher'),activity.id,{action:'release',scope:'answered'});
  await api.commandActivity(actor('teacher'),activity.id,{action:'close'});
  const allActivity=await api.createActivity(actor('teacher'),quiz,crypto.randomUUID(),true);
  await api.commandActivity(actor('student'),allActivity.id,{action:'answer',expectedVersion:0,answers:{q:['a']}});
  await api.commandActivity(actor('teacher'),allActivity.id,{action:'release',scope:'all'});
  const draft=await api.createActivity(actor('teacher'),quiz,crypto.randomUUID());
  await db.classroomActivitySubmission.create({data:{activityId:draft.id,userId:'draft-only',displayName:'Draft only',answers:{q:['a']},grading:{q:1}}});
  await db.classroomRuntime.update({where:{id:h.runtime.id},data:{status:'ended'}});
  await db.courseSession.update({where:{id:h.lesson.id},data:{status:'finished',endedAt:new Date()}});
  // Exercise the real route and database with a controlled request-access boundary.
  // The stub supplies identity only; the route still checks role, roster and release scope.
  routeFile=path.join(__dirname,'../../node_modules/.cache/activity-acceptance',`replay-route-${crypto.randomUUID()}.cjs`);
  const access=`export async function resolveClassroomRequestAccess(request,sessionId){const role=request.headers.get('x-fixture-role')||'student';const userId=request.headers.get('x-fixture-user')||'student';return {ok:true,session:{userId,displayName:userId},access:{courseId:${JSON.stringify(h.course.id)},sessionId,role}}}`;
  await esbuild.build({stdin:{contents:'export {GET} from "@/app/api/sessions/[sessionId]/replay-preview/route";',resolveDir:path.resolve(__dirname,'../..')},outfile:routeFile,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.resolve(__dirname,'../../tsconfig.json'),plugins:[{name:'controlled-access',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));build.onResolve({filter:/^@\/lib\/classroom\/server\/request-access$/},()=>({path:'access',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='access'?access:'',loader:'js'}));}}]});
  const route=require(routeFile);const request=async(role,query='')=>route.GET(new NextRequest(`http://localhost/api/sessions/${h.lesson.id}/replay-preview${query}`,{headers:{'x-fixture-role':role,'x-fixture-user':role==='teacher'?'teacher':role==='assistant'?'assistant':'student'}}),{params:Promise.resolve({sessionId:h.lesson.id})});
  assert.equal((await request('student')).status,403,'students cannot use the teacher preview route');
  assert.equal((await request('assistant')).status,200,'an authorized assistant can use the teacher preview route');
  assert.equal((await request('teacher','?student=foreign')).status,404,'unknown students cannot be previewed');
  assert.equal((await request('teacher',`?student=student&activity=${activity.id}`)).status,200);
  const own=await (await request('teacher',`?student=student&activity=${activity.id}`)).json();
  assert.equal(own.ownResponse.userId,'student');assert.deepEqual(own.responses,[]);assert.equal(own.statistics,null);
  const hidden=await (await request('teacher',`?student=student3&activity=${activity.id}`)).json();
  assert.equal(hidden.resultsVisible,false);assert.equal(hidden.definition.questions[0].correct,undefined);
  const released=await (await request('teacher',`?student=student3&activity=${allActivity.id}`)).json();
  assert.equal(released.resultsVisible,true);assert.deepEqual(released.definition.questions[0].correct,['a']);
  const msg=(id,scope,senderId,recipientId=null,deletedAt=null)=>({id,runtimeId:h.runtime.id,courseId:h.course.id,sessionId:h.lesson.id,senderId,senderName:senderId,senderRole:senderId==='teacher'?'teacher':'student',scope,recipientId,content:id,deletedAt});
  await db.classroomMessage.createMany({data:[
   msg('replay-public','classroom','teacher'),msg('replay-own-private','direct','teacher','student'),
   msg('replay-other-private','direct','teacher','student2'),msg('replay-student-private','direct','student2','student'),
   msg('replay-staff','staff','teacher'),msg('replay-deleted','classroom','teacher',null,new Date()),
  ]});
  const chat=await request('teacher','?student=student&view=chat');assert.equal(chat.status,200);
  assert.equal(chat.headers.get('cache-control'),'private, no-store');
  const visible=(await chat.json()).messages;assert.deepEqual(visible.map(row=>row.id).sort(),['replay-deleted','replay-own-private','replay-public']);
  assert.equal(visible.find(row=>row.id==='replay-deleted').content,'');assert.equal(visible.find(row=>row.id==='replay-deleted').deleted,true);
  assert.equal((await request('teacher','?student=student&view=chat&before=replay-other-private')).status,400,'pagination cannot use another student private message');
  assert.equal((await request('student','?student=student&view=chat')).status,403);
  // Student replay is a separate route; verify it independently of teacher preview.
  messageRouteFile=path.join(__dirname,'../../node_modules/.cache/activity-acceptance',`replay-chat-${crypto.randomUUID()}.cjs`);
  const boundaries={
   '@/lib/session':`export async function getSessionFromRequest(request){const userId=request.headers.get('x-fixture-user');return userId?{userId}:null}`,
   '@/lib/courseware-access':`export async function resolveCoursewareAccess(identity){return {allowed:identity.userId!=='outsider',teaching:identity.userId==='teacher',observer:false}}`,
   'server-only':'',
  };
  await esbuild.build({stdin:{contents:'export {GET} from "@/app/api/sessions/[sessionId]/replay-messages/route";',resolveDir:path.resolve(__dirname,'../..')},outfile:messageRouteFile,bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.resolve(__dirname,'../../tsconfig.json'),plugins:[{name:'identity-boundary',setup(build){build.onResolve({filter:/.*/},args=>args.path in boundaries?{path:args.path,namespace:'fixture'}:undefined);build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:boundaries[args.path],loader:'js'}));}}]});
  const chatRoute=require(messageRouteFile);const studentChat=async(user,query='')=>chatRoute.GET(new NextRequest(`http://localhost/api/sessions/${h.lesson.id}/replay-messages${query}`,{headers:user?{'x-fixture-user':user}:{}}),{params:Promise.resolve({sessionId:h.lesson.id})});
  assert.equal((await studentChat('')).status,401);assert.equal((await studentChat('outsider')).status,403);
  const actualStudentChat=await (await studentChat('student')).json();
  assert.deepEqual(actualStudentChat.messages.map(row=>row.id).sort(),['replay-deleted','replay-own-private','replay-public','replay-student-private']);
  assert.equal((await studentChat('student','?before=replay-other-private')).status,400);
  const teacherDetail=await api.activityDetail(actor('teacher'),activity.id);
  assert.deepEqual(teacherDetail.responses.map(r=>r.userId).sort(),['former','student','student2']);
  for(const [userId,answer] of [['student','a'],['student2','b']]){
   const detail=await api.activityDetail(actor(userId),activity.id);
   assert.equal(detail.ownResponse.userId,userId);assert.deepEqual(detail.ownResponse.answers,{q:[answer]});
   assert.deepEqual(detail.responses,[]);assert.equal(detail.statistics,null);assert.equal(detail.responseCount,1);
   assert.equal(detail.resultsVisible,true);assert.deepEqual(detail.definition.questions[0].correct,['a']);
  }
  const unanswered=await api.activityDetail(actor('student3'),activity.id);
  assert.equal(unanswered.ownResponse,null);assert.deepEqual(unanswered.responses,[]);assert.equal(unanswered.statistics,null);
  assert.equal(unanswered.resultsVisible,false);assert.equal(unanswered.definition.questions[0].correct,undefined);
  const allUnanswered=await api.activityDetail(actor('student3'),allActivity.id);
  assert.equal(allUnanswered.resultsVisible,true);assert.deepEqual(allUnanswered.definition.questions[0].correct,['a']);
  assert.equal(allUnanswered.ownResponse,null);assert.deepEqual(allUnanswered.responses,[]);assert.equal(allUnanswered.statistics,null);
  assert.deepEqual((await api.activityDetail(actor('teacher'),allActivity.id)).responses.map(r=>r.userId),['student']);
  const roster=await api.replayPreviewStudents(actor('teacher'));
  const overview=await api.activityOverview(actor('teacher'));
  assert.deepEqual(roster.students.map(x=>x.userId).sort(),overview.students.map(x=>x.userId).sort());
  assert.ok(roster.students.some(x=>x.userId==='former'));
  assert.ok(!roster.students.some(x=>x.userId==='draft-only'));
  assert.deepEqual((await api.replayPreviewStudents(actor('teacher'),'former')).students,[{userId:'former',displayName:'Former student'}]);
  assert.deepEqual((await api.replayPreviewStudents(actor('teacher'),'draft-only')).students,[]);
  assert.deepEqual((await api.replayPreviewStudents(actor('teacher'),'foreign')).students,[]);
  const denied=await api.replayPreviewStudents(actor('student'));assert.equal(denied.canManage,false);assert.deepEqual(denied.students,[]);
  await db.courseStudent.create({data:{courseId:h.course.id,studentId:'enrolled',studentName:'Enrolled student'}});
  const noRuntime=await db.courseSession.create({data:{courseId:h.course.id,position:2,roomUuid:crypto.randomUUID(),roomType:4,title:'No runtime',startTime:new Date(Date.now()-7200000),endTime:new Date(Date.now()-3600000),endedAt:new Date(),status:'finished',createdBy:'teacher'}});
  const withoutRuntime={...actor('teacher'),sessionId:noRuntime.id};
  assert.deepEqual((await api.replayPreviewStudents(withoutRuntime)).students,[{userId:'enrolled',displayName:'Enrolled student'}]);
  assert.deepEqual((await api.replayPreviewStudents(withoutRuntime,'enrolled')).students,[{userId:'enrolled',displayName:'Enrolled student'}]);
  assert.deepEqual((await api.replayPreviewStudents(withoutRuntime,'foreign')).students,[]);
  assert.equal((await api.replayPreviewStudents({...withoutRuntime,role:'student'})).canManage,false);
  console.log('PASS replay preview and student chat route visibility (real PostgreSQL, controlled request identity)');
 }finally{await h.close();if(routeFile)await fs.rm(routeFile,{force:true});if(messageRouteFile)await fs.rm(messageRouteFile,{force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
