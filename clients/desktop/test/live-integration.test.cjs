const test=require('node:test');
const assert=require('node:assert/strict');
const {requestFor}=require('../src/client-contract.cjs');
const {navigationFor,verifiedClassroomUrl,trustedMediaFrame}=require('../src/home-contract.cjs');
const {createApiClient}=require('../src/api-client.cjs');
const model=require('../src/home/model.js');
const base='https://live.example.com';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('course and session reads use bounded authenticated API descriptors',()=>{
 assert.equal(requestFor('sessions',{courseId:'lesson?admin=1'}).path,'/api/courses/lesson%3Fadmin%3D1/sessions');
 assert.equal(requestFor('verifyAccess',{courseId:'course',sessionId:'single lesson'}).path,'/api/courses/course/verify-access?sessionId=single%20lesson');
 for(const id of ['',null,'..','.'])assert.throws(()=>requestFor('course',{courseId:id}));
 assert.throws(()=>requestFor('verifyAccess',{courseId:'course',sessionId:''}));
});
test('remote destinations cannot become arbitrary URLs or cross-origin classroom entries',()=>{
 assert.equal(navigationFor('playback',{courseId:'c',sessionId:'s'},base),base+'/courses/c/playback?sessionId=s');
 for(const page of ['https://evil.example','javascript:alert(1)','classroom','logout'])assert.throws(()=>navigationFor(page,{},base));
 for(const value of [null,{allowed:false,reason:'Denied'},{allowed:true,classroomUrl:'https://evil.example/classroom?sessionId=s'},{allowed:true,classroomUrl:'/classroom?sessionId=another'},{allowed:true,classroomUrl:'/api/auth/me?sessionId=s'},{allowed:true,classroomUrl:'/classroom?sessionId=s&recorderToken=secret'}])assert.throws(()=>verifiedClassroomUrl(value,base,'s'));
 assert.equal(verifiedClassroomUrl({allowed:true,classroomUrl:'/classroom?sessionId=s'},base,'s'),base+'/classroom?sessionId=s');
 assert.equal(trustedMediaFrame(base+'/login',base),false);assert.equal(trustedMediaFrame('https://evil.example/classroom?sessionId=s',base),false);assert.equal(trustedMediaFrame(base+'/classroom?sessionId=s',base),true);
});
test('one shared HttpOnly-session refresh recovers parallel reads without renderer tokens',async()=>{
 let fresh=false,refreshes=0;const calls=[];
 const request=createApiClient({base,session:{fetch:async(url,opts)=>{calls.push([url,opts]);assert.equal(opts.credentials,'include');assert.equal(opts.redirect,'error');if(url.endsWith('/refresh')){refreshes++;await new Promise(r=>setTimeout(r,8));fresh=true;return json({ok:true});}return fresh?json({courses:[],groups:[]}):json({},401);}}});
 const [a,b]=await Promise.all([request('courses'),request('groups')]);assert.equal(refreshes,1);assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(calls.filter(([url])=>!url.endsWith('/refresh')).length,4);assert.ok(!JSON.stringify([a,b]).includes('cookie'));
});
test('weak-network refresh failure preserves the distinction from a signed-out session',async()=>{
 const request=createApiClient({base,session:{fetch:async url=>url.endsWith('/refresh')?json({ok:false},503):json({},401)}});
 const result=await request('identity');assert.equal(result.ok,false);assert.equal(result.status,503);
 const expired=createApiClient({base,session:{fetch:async()=>json({},401)}});assert.deepEqual(await expired('identity'),{ok:true,data:{user:null}});
});
test('network timeout is reported without replaying mutations',async()=>{
 let calls=0;const request=createApiClient({base,timeoutMs:10,session:{fetch:(_url,options)=>{calls++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))));}}});
 const result=await request('createGroup',{name:'Group'});assert.equal(result.ok,false);assert.equal(result.status,0);assert.equal(calls,1);
});
test('live lists have no sample fallbacks and ended sessions never appear as upcoming',()=>{
 assert.deepEqual(model.lessons([]),[]);assert.deepEqual(model.students([],[]),[]);
 const courses=[{id:'c',name:'Real course',canTeach:false,students:[{studentId:'private',studentName:'Private'}],sessions:[{id:'s',startTime:'2030-01-01T00:00Z',endTime:'2030-01-01T01:00Z',status:'live',endedAt:'2029-01-01T00:00Z'}]}];
 assert.equal(model.nextLessons(courses,Date.parse('2028-01-01')).length,0);assert.deepEqual(model.students(courses,[]),[]);
 const root={id:'g',name:'Group',members:[],children:[]};root.children.push(root);assert.equal(model.groups([root]).length,1);
});

test('course creation keeps one idempotency key and does not accept client roles',async()=>{
 const args={name:'New course',requestId:'stable-id',startTime:'2030-01-01T10:00:00.000Z',endTime:'2030-01-01T11:00:00.000Z',timezone:'Asia/Shanghai',ownerId:'forged',role:'teacher'};
 const spec=requestFor('createCourse',args);assert.equal(spec.headers['Idempotency-Key'],'stable-id');assert.equal(spec.body.ownerId,undefined);assert.equal(spec.body.role,undefined);
 assert.throws(()=>requestFor('createCourse',{...args,endTime:args.startTime}));assert.throws(()=>requestFor('createCourse',{...args,timezone:'invalid'}));
 let options;const request=createApiClient({base,session:{fetch:async(_url,opts)=>{options=opts;return json({course:{id:'saved'}});}}});await request('createCourse',args);assert.equal(options.headers['Idempotency-Key'],'stable-id');assert.equal(options.headers.Origin,base);
});
