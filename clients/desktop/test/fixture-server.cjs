/* Local acceptance API; no production requests or credentials. */
const http=require('node:http');
const runtime={revision:4,status:'live',members:[{userId:'teacher',displayName:'陈老师',role:'teacher',online:true,onStage:true},{userId:'student',displayName:'李明',role:'student',online:true,onStage:false,microphoneAllowed:false,cameraAllowed:false,whiteboardWritable:false,handRaisedAt:'2026-11-08T01:00:00Z',rewardCount:0},{userId:'second',displayName:'小林',role:'student',online:true,onStage:true,microphoneAllowed:true,cameraAllowed:true,whiteboardWritable:true},{userId:'away',displayName:'暂离学生',role:'student',online:false}]};
const groups=[{id:'group',name:'算法基础班',members:[{userId:'student',userName:'李明',username:'liming'},{userId:'second',userName:'小林',username:'xiaolin'}]},{id:'other',name:'Python 进阶班',members:Array.from({length:15},(_,i)=>({userId:'learner-'+i,userName:'测试学生 '+(i+1),username:'learner'+i}))}];
const receipts=new Map();
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:3180');res.setHeader('Cache-Control','no-store');
 const json=(value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 let body={};if(req.method==='POST'){let text='';for await(const chunk of req)text+=chunk;try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON'},400);}}
 if(url.pathname==='/api/auth/me')return json({user:{userId:'teacher',name:'teacher',displayName:'陈老师',role:'teacher'}});
 if(url.pathname==='/api/groups'){
  if(req.method==='GET')return json({groups});
  if(body.action==='create'){const group={id:crypto.randomUUID(),name:body.name,members:[]};groups.push(group);return json({group},201);}
  const group=groups.find(group=>group.id===body.groupId);if(!group)return json({error:'Group missing'},404);
  if(body.action==='removeMembers')group.members=group.members.filter(member=>!body.userIds.includes(member.userId));
  if(body.action==='addMembers')for(const member of body.members)if(!group.members.some(existing=>existing.userId===member.userId))group.members.push(member);
  return json({ok:true});
 }
 if(url.pathname==='/api/users/search')return json({users:[{id:'new-student',name:'xiaoyu',displayName:'小宇',avatar:''},{id:'student',name:'liming',displayName:'李明',avatar:''}]});
 if(url.pathname.endsWith('/classroom/state'))return json({runtime});
 if(url.pathname.endsWith('/classroom/actions')){
  if(receipts.has(body.commandId))return json(receipts.get(body.commandId));
  if(body.expectedRevision!==runtime.revision)return json({error:'名单已更新，请刷新后操作。'},409);
  const action=body.action,member=runtime.members.find(member=>member.userId===action.targetUserId);
  if(action.type==='inviteStage')member.stageState='invited';if(action.type==='removeStage'){member.onStage=false;member.stageState='off';}
  if(action.type==='setMediaAllowed')Object.assign(member,{microphoneAllowed:action.microphoneAllowed,cameraAllowed:action.cameraAllowed});
  if(action.type==='setWhiteboardWritable')member.whiteboardWritable=action.writable;
  if(action.type==='giveReward')for(const id of action.targetUserIds)runtime.members.find(member=>member.userId===id).rewardCount=(runtime.members.find(member=>member.userId===id).rewardCount||0)+1;
  if(action.type==='muteAllMicrophones')for(const member of runtime.members.filter(member=>member.role==='student'))member.microphoneAllowed=false;
  if(action.type==='removeAllStudentsFromStage')for(const member of runtime.members.filter(member=>member.role==='student'))member.onStage=false;
  runtime.revision++;const result={ok:true,runtime};receipts.set(body.commandId,result);return json(result);
 }
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#1b222d;color:#e8edf5;font:14px/1.6 system-ui}header{padding:14px 22px;border-bottom:1px solid #465164;display:flex;justify-content:space-between}a{color:#b6c9fa}.rail{display:flex;gap:12px;padding:20px}.seat{width:180px;height:110px;background:#34445c;border-radius:8px;padding:12px}.board{margin:12px 32px;background:#243c37;min-height:420px;padding:40px;border-radius:8px}h1{font-size:28px}.notice{padding:18px 32px;color:#b6c2d3}</style><header><strong>客户端课堂验收 · 本地测试</strong><a href="/classroom?sessionId=client-lesson">进入测试课堂</a></header><section class="classroom-v3-shell is-classin-layout"><div class="rail"><div class="seat">陈老师<br>教师席</div><div class="seat">小林<br>台上学生</div></div><div class="board"><h1>集合与不等式</h1><p>已知 a &gt; 0，b &gt; 0，且 a + b = 2</p><p>求 1/a + 1/b 的最小值。</p></div><p class="notice">测试数据与音视频替身；通过左下角“人员工作台”或 ⌘/Ctrl + 2 打开客户端成员管理。</p></section></html>`);
}).listen(3180,'127.0.0.1',()=>console.log('Client acceptance fixture at http://127.0.0.1:3180'));
