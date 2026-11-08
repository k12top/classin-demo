/* Local UI acceptance fixture, never packaged and never used by the live client. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {requestFor}=require('../src/client-contract.cjs');
const root=path.join(__dirname,'../src/home'),design=path.join(__dirname,'../design/classin-v5');
let authenticated=true,failReads=false;
const future=new Date(Date.now()+3600000),end=new Date(Date.now()+7200000),past=new Date(Date.now()-86400000);
const courses=[{id:'course-real-shape',name:'Python 算法课程',description:'接口连接验收夹具，所有人员与课程均为虚构。',teacherName:'测试老师',canTeach:true,joinedAs:'teacher',sessionCount:2,students:[{studentId:'test-student',studentName:'测试学生'}],sessions:[{id:'lesson-upcoming',title:'双指针与有序数组',position:2,leadTeacherName:'测试老师',startTime:future.toISOString(),endTime:end.toISOString(),status:'scheduled'},{id:'lesson-ended',title:'二分查找',position:1,leadTeacherName:'测试老师',startTime:new Date(past-3600000).toISOString(),endTime:past.toISOString(),endedAt:past.toISOString(),status:'finished',_count:{recordings:1}}]},{id:'course-second',name:'C++ 入门课程',teacherName:'测试老师',canTeach:true,joinedAs:'teacher',sessionCount:0,sessions:[],students:[]}];
const groups=[{id:'group-one',name:'算法学习组',members:[{userId:'test-student',userName:'测试学生'},{userId:'second-student',userName:'测试同学'}]}];
const bridge=`window.classroomHome={request:async(op,args)=>{const r=await fetch('/fixture-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,args})});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error),{status:r.status});return data;},navigate:async(page,args)=>{document.getElementById('fixture-result').textContent='导航：'+page+' '+JSON.stringify(args||{});},enter:async(args)=>{const r=await fetch('/api/courses/'+encodeURIComponent(args.courseId)+'/verify-access?sessionId='+encodeURIComponent(args.sessionId||''));const data=await r.json();if(!data.allowed)throw new Error(data.reason);document.getElementById('fixture-result').textContent='后端已核验课节，目标：'+data.classroomUrl;},openPeople:async()=>{document.getElementById('fixture-result').textContent='打开真实人员工作台入口';},focusClassroom:async()=>{}};document.addEventListener('DOMContentLoaded',()=>{const box=document.createElement('aside');box.id='fixture-controls';box.innerHTML='<strong>本地接口夹具 · 非真实媒体</strong><button id="fixture-fail">模拟网络故障</button><button id="fixture-recover">恢复连接</button><button id="fixture-logout">模拟登录过期</button><span id="fixture-result"></span>';document.body.append(box);for(const [id,action]of [['fixture-fail','fail'],['fixture-recover','recover'],['fixture-logout','logout']])document.getElementById(id).onclick=async()=>{await fetch('/fixture-control',{method:'POST',body:action});window.dispatchEvent(new Event('focus'));};});`;
const assets=new Map([['/home.js',path.join(root,'home.js')],['/model.js',path.join(root,'model.js')],['/time.js',path.join(design,'time.js')],['/home.css',path.join(root,'home.css')],['/design.css',path.join(design,'style.css')],...['ocean','canyon','forest'].map(f=>['/assets/'+f+'.png',path.join(design,'assets',f+'.png')])]);
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3184');res.setHeader('Cache-Control','no-store');const json=(data,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 let text='';if(req.method==='POST')for await(const chunk of req)text+=chunk;
 if(url.pathname==='/fixture-control'){if(text==='logout')authenticated=false;else if(text==='fail')failReads=true;else{authenticated=true;failReads=false;}return json({ok:true});}
 if(url.pathname==='/fixture-request'){
  const {op,args}=JSON.parse(text);let spec;try{spec=requestFor(op,args);}catch{return json({error:'Invalid operation'},400);}if(op==='createCourse'){const course={id:'created-course',...spec.body,canTeach:true,joinedAs:'teacher',teacherName:'测试老师',students:[],sessions:spec.body.startTime?[{id:'created-lesson',title:spec.body.name+' · 第1课',startTime:spec.body.startTime,endTime:spec.body.endTime,status:'scheduled'}]:[]};courses.push(course);return json({course},201);}return serveApi(new URL(spec.path,url));
 }
 if(url.pathname.startsWith('/api/'))return serveApi(url);
 function serveApi(u){
  if(!authenticated)return u.pathname==='/api/auth/me'?json({user:null}):json({error:'登录已过期'},401);
  if(failReads)return json({error:'测试网络故障：已保留当前内容。'},503);
  if(u.pathname==='/api/auth/me')return json({user:{userId:'test-teacher',name:'test-teacher',displayName:'测试老师',role:'teacher'}});
  if(u.pathname==='/api/courses')return json({courses});if(u.pathname==='/api/groups')return json({groups});
  if(u.pathname.endsWith('/verify-access'))return json({allowed:true,classroomUrl:'/classroom?sessionId='+encodeURIComponent(u.searchParams.get('sessionId'))});
  const course=courses.find(c=>u.pathname==='/api/courses/'+c.id);if(course)return json({course});return json({error:'Not found'},404);
 }
 if(url.pathname==='/fixture-bridge.js'){res.setHeader('Content-Type','text/javascript');return res.end(bridge);}
 if(url.pathname==='/'){let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace("script-src 'self'","script-src 'self'").replace("connect-src 'none'","connect-src 'self'").replace('<script src="model.js">','<script src="fixture-bridge.js"></script><script src="model.js">').replace('<link rel="stylesheet" href="home.css">','<link rel="stylesheet" href="home.css"><link rel="stylesheet" href="fixture.css">');res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
 if(url.pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end('#fixture-controls{position:fixed;bottom:0;left:160px;right:0;background:#fff5dc;padding:5px 10px;z-index:20;font:10px/1.6 system-ui;display:flex;gap:9px;align-items:center}#fixture-controls button{font:inherit;background:white;border:1px solid #c9b989;border-radius:4px;padding:3px 7px}#fixture-result{overflow-wrap:anywhere}');}
 const file=assets.get(url.pathname);if(!file){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/javascript');fs.createReadStream(file).pipe(res);
});
server.listen(3184,'127.0.0.1',()=>console.log('Live client UI fixture http://127.0.0.1:3184'));
