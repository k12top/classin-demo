// Real local HTTP authorization, database and provider output. Short-lived test identities.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
require('dotenv').config({path:['.env.local','env.local'],quiet:true});
const root=path.resolve(__dirname,'../..'),output=path.join(root,'outputs/cloud-recording-live');
async function harness(){
  const db=new URL(process.env.DATABASE_URL||'http://invalid');
  assert.equal(process.env.CLASSIN_TEST_CLOUD_RECORDING,'1');assert.equal(db.hostname,'127.0.0.1');assert.equal(db.pathname,'/classin_unified_dev');
  const f=JSON.parse(await fs.readFile(path.join(output,'fixture.json'),'utf8'));
  assert.ok(Date.now()<f.expiresAt,'Fixture expired');
  const {SignJWT}=await import('jose');
  const users={teacher:{...f.teacher,role:'teacher'},student:{userId:f.students[0].studentId,name:f.students[0].studentName,displayName:f.students[0].studentName,role:'student'},other:{userId:f.students[1].studentId,name:f.students[1].studentName,displayName:f.students[1].studentName,role:'student'},outsider:{userId:`outsider-${f.runId}`,name:'Unenrolled test user',displayName:'Unenrolled test user',role:'teacher'}};
  const tokens={};for(const [key,user]of Object.entries(users))tokens[key]=await new SignJWT({...user,avatar:'',email:'',expiresAt:new Date(f.expiresAt).toISOString()}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime(Math.floor(f.expiresAt/1000)).sign(new TextEncoder().encode(process.env.SESSION_SECRET||'fallback-secret-change-me-in-production-32chars!'));
  const requests=[];
  async function request(actor,url,method='GET',body,status=200){
    const response=await fetch(`http://localhost:3000${url}`,{method,redirect:'manual',headers:{Authorization:`Bearer ${tokens[actor]}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
    const raw=await response.text();requests.push({actor,path:url.split('?')[0],method,status:response.status});
    assert.equal(response.status,status,`${actor} ${method} ${url.split('?')[0]}: ${response.headers.get('content-type')?.includes('json')?raw.slice(0,500):'non-JSON response'}`);
    return response.headers.get('content-type')?.includes('json')?JSON.parse(raw):raw;
  }
  return {f,users,tokens,requests,request};
}
async function run(){
  const h=await harness(),{f,request}=h,base=`/api/sessions/${f.sessionId}/classroom/activities`;
  if(process.argv.includes('--activities')){
    for(const actor of ['student','other'])await request(actor,'/api/classroom/session','POST',{sessionId:f.sessionId,clientId:`${f.runId}-${actor}`,deviceEntryMode:'replace'});
    const quiz=title=>({title,kind:'quiz',definition:{questions:[{id:'q',type:'single',prompt:'How many sides does a triangle have?',points:10,options:[{id:'a',text:'Three'},{id:'b',text:'Four'}],correct:['a'],explanation:'A triangle has three sides.'}]}});
    const make=async title=>(await request('teacher',base,'POST',{activity:quiz(title),requestId:crypto.randomUUID(),start:true},201)).id;
    const all=await make('Cloud replay: all students');
    for(const [actor,answer]of [['student','a'],['other','b']])await request(actor,`${base}/${all}`,'PATCH',{action:'answer',expectedVersion:0,answers:{q:[answer]}});
    await request('teacher',`${base}/${all}`,'PATCH',{action:'release',scope:'all'});
    const answered=await make('Cloud replay: answered students');
    await request('student',`${base}/${answered}`,'PATCH',{action:'answer',expectedVersion:0,answers:{q:['b']}});
    await request('teacher',`${base}/${answered}`,'PATCH',{action:'release',scope:'answered'});
    const hidden=await make('Cloud replay: unreleased answer');
    await request('student',`${base}/${hidden}`,'PATCH',{action:'answer',expectedVersion:0,answers:{q:['a']}});
    await request('teacher',`${base}/${hidden}`,'PATCH',{action:'close'});
    await fs.writeFile(path.join(output,'activities.json'),JSON.stringify({all,answered,hidden,requests:h.requests},null,2));
    console.log('PASS real HTTP quiz publication, two student submissions and both answer-release scopes');return;
  }
  const ids=JSON.parse(await fs.readFile(path.join(output,'activities.json'),'utf8'));
  if(process.argv.includes('--release-all')){
    await request('teacher',`${base}/${ids.answered}`,'PATCH',{action:'release',scope:'all'});
    const detail=await request('other',`${base}/${ids.answered}`);
    assert.equal(detail.ownResponse,null);assert.equal(detail.responseCount,0);assert.equal(detail.resultsVisible,true);
    assert.deepEqual(detail.responses,[]);assert.equal(detail.statistics,null);assert.deepEqual(detail.definition.questions[0].correct,['a']);
    assert.equal(detail.definition.questions[0].explanation,'A triangle has three sides.');
    assert.ok(!JSON.stringify(detail).includes(h.users.student.userId));
    await fs.writeFile(path.join(output,'release-all-result.json'),JSON.stringify({passed:true,unansweredStudentSeesAnswers:true,noOtherStudentResponses:true,requests:h.requests},null,2));
    console.log('PASS all-student release reveals answers to an unanswered student without exposing other responses');return;
  }
  const teacher=await request('teacher',`${base}/${ids.all}`),student=await request('student',`${base}/${ids.all}`),other=await request('other',`${base}/${ids.all}`);
  assert.equal(teacher.responses.length,2);assert.equal(teacher.responseCount,2);assert.equal(teacher.statistics.q.a,1);assert.equal(teacher.statistics.q.b,1);
  for(const [detail,actor]of [[student,'student'],[other,'other']]){
    assert.equal(detail.ownResponse.userId,h.users[actor].userId);assert.deepEqual(detail.responses,[]);assert.equal(detail.responseCount,1);assert.equal(detail.statistics,null);assert.equal(detail.roster,undefined);
    assert.deepEqual(detail.definition.questions[0].correct,['a']);
    assert.ok(!JSON.stringify(detail).includes(h.users[actor==='student'?'other':'student'].userId),'No other student identifier in the response');
  }
  const answered=await request('student',`${base}/${ids.answered}`),unanswered=await request('other',`${base}/${ids.answered}`),hidden=await request('student',`${base}/${ids.hidden}`);
  assert.equal(answered.resultsVisible,true);assert.deepEqual(answered.definition.questions[0].correct,['a']);
  for(const detail of [unanswered,hidden]){assert.equal(detail.resultsVisible,false);assert.equal(detail.definition.questions[0].correct,undefined);assert.equal(detail.definition.questions[0].explanation,undefined);}
  assert.equal(unanswered.ownResponse,null);assert.equal(unanswered.responseCount,0);
  for(const actor of ['teacher','student','other']){
    const list=await request(actor,base),overview=await request(actor,`${base}?overview=1`);
    assert.equal(list.live,false);assert.equal(overview.live,false);
    if(actor!=='teacher')assert.ok(!JSON.stringify(overview).includes(h.users[actor==='student'?'other':'student'].userId),'Overview only includes the viewer');
  }
  const csv=await request('teacher',`${base}/${ids.all}?export=csv`);assert.ok(csv.includes(h.users.other.displayName));
  await request('student',`${base}/${ids.all}?export=csv`,'GET',null,403);
  await request('student',`${base}/${ids.all}?cursor=${teacher.responses.find(r=>r.userId===h.users.other.userId).id}`,'GET',null,400);
  await request('outsider',base,'GET',null,403);
  const recordings=await request('teacher',`/api/sessions/${f.sessionId}/recordings`);
  const playable=recordings.recordings.find(r=>r.playbackUrl);assert.ok(playable,'Real recording output must be available');
  const source=await request('student',playable.playbackUrl+'&delivery=url');assert.ok(source.url||source.playbackUrl);
  await request('outsider',playable.playbackUrl,'GET',null,403);
  const summary=await request('student',`/api/sessions/${f.sessionId}/summary`);
  assert.ok(summary.captions?.length,'Real final STT captions must be archived');
  assert.ok(summary.captions.some(c=>/triangle|fraction|classroom|half/i.test(c.text)));
  await fs.writeFile(path.join(output,'access-result.json'),JSON.stringify({passed:true,at:new Date().toISOString(),courseId:f.courseId,sessionId:f.sessionId,recordings:recordings.recordings.map(({id,status,mode,playbackFormat})=>({id,status,mode,playbackFormat})),captionCount:summary.captions.length,teacherResponseCount:teacher.responses.length,studentResponseCount:student.responseCount,requests:h.requests,identityBoundary:'Short-lived locally signed teacher and enrolled student test sessions; real authorization routes, PostgreSQL and provider files; no SSO login assertion.'},null,2));
  console.log('PASS real replay HTTP: teacher sees both students, students see only their own responses, release scopes, CSV/cursor/outsider isolation and real recording/captions');
}
module.exports={harness};
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
