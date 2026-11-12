import test from "node:test";
import assert from "node:assert/strict";
import {taskInput,taskRequestId} from "../src/lib/workspace-task-validation";
import {loadModule} from "./helpers/load-module";
import {NextRequest} from "next/server";
import {retryIdempotentWrite,UncertainWriteError} from "../src/lib/workspace-idempotent-write";
import type {workspaceRequest} from "../src/lib/workspace-client";
test("task validation rejects impossible dates and bounds input",()=>{
 assert.throws(()=>taskInput({title:"x",dueDate:"2026-02-30"}));assert.throws(()=>taskInput({title:" "}));assert.throws(()=>taskRequestId("bad"));
 assert.deepEqual(taskInput({title:"  Prepare  ",dueDate:"2028-02-29"}),{title:"Prepare",notes:"",dueDate:"2028-02-29",courseId:null,sessionId:null});
});
test("a lost task creation response retries the exact request and creates only one task",async()=>{
 const saved=new Map<string,Record<string,unknown>>();let attempts=0;
 const route=loadModule<{POST(request:NextRequest):Promise<Response>}>("src/app/api/workspace/tasks/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:true})},
  "@/lib/workspace-task-validation":{taskInput,taskRequestId},
  "@/lib/db":{prisma:{workspaceTask:{upsert:async({where,create}:{where:{userId_requestId:{requestId:string}},create:Record<string,unknown>})=>{const id=where.userId_requestId.requestId;if(!saved.has(id))saved.set(id,{...create,id:"saved-task"});return saved.get(id);}}}},
 });
 const body=JSON.stringify({title:"Prepare lesson",notes:"notes",dueDate:null,courseId:null,sessionId:null});
 const request=(async(_path:string,options:RequestInit)=>{attempts++;const response=await route.POST(new NextRequest("http://localhost/api/workspace/tasks",{method:options.method,headers:options.headers,body:options.body}));if(attempts===1)throw new TypeError("response lost");if(!response.ok)throw Object.assign(new Error("failed"),{status:response.status});return response.json();}) as typeof workspaceRequest;
 const result=await retryIdempotentWrite<{task:{id:string}}>("/api/workspace/tasks","POST","task-request-1",body,request);
 assert.equal(result.task.id,"saved-task");assert.equal(saved.size,1);assert.equal(attempts,2);
 const offline=(async()=>{throw new TypeError("offline");}) as typeof workspaceRequest;
 await assert.rejects(retryIdempotentWrite("/tasks","POST","task-request-2",body,offline),UncertainWriteError);
});
test("task updates constrain owner and version before writing",async()=>{
 let where:unknown;
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/tasks/[id]/route.ts",{
  "@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:false})},
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/db":{prisma:{workspaceTask:{updateMany:async(args:{where:unknown})=>{where=args.where;return{count:0};},findFirst:async()=>null}}},
  "@/lib/workspace-task-validation":{taskInput},
 });
 const response=await route.PATCH(new NextRequest("http://localhost/api/workspace/tasks/other",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:3,completed:true,userId:"teacher-b"})}),{params:Promise.resolve({id:"other"})});
 assert.equal(response.status,404);assert.deepEqual(where,{id:"other",userId:"teacher-a",version:3});
});
test("task deletion is owner and version scoped and reports conflicts",async()=>{
 let where:unknown,exists=true,count=0;
 const route=loadModule<{DELETE(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/tasks/[id]/route.ts",{
  "@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:false})},
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/db":{prisma:{workspaceTask:{deleteMany:async(args:{where:unknown})=>{where=args.where;return{count};},findFirst:async()=>exists?{id:"task"}:null}}},
  "@/lib/workspace-task-validation":{taskInput},
 });
 const call=(version:unknown)=>route.DELETE(new NextRequest("http://localhost/api/workspace/tasks/task",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({version,userId:"teacher-b"})}),{params:Promise.resolve({id:"task"})});
 assert.equal((await call(-1)).status,400);
 assert.equal((await call(3)).status,409);
 assert.deepEqual(where,{id:"task",userId:"teacher-a",version:3});
 exists=false;assert.equal((await call(3)).status,404);
 count=1;assert.equal((await call(3)).status,200);
});
test("task pagination rejects a cursor owned by another user",async()=>{
 let listed=false;
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>("src/app/api/workspace/tasks/route.ts",{
  "@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:false})},
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/db":{prisma:{workspaceTask:{findFirst:async(args:{where:{userId:string}})=>{assert.equal(args.where.userId,"teacher-a");return null;},findMany:async()=>{listed=true;return[];}}}},
  "@/lib/workspace-task-validation":{taskInput,taskRequestId},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/tasks?cursor=foreign"));
 assert.equal(response.status,400);assert.equal(listed,false);
});
test("task listing returns a continuation cursor without losing the boundary row",async()=>{
 const rows=Array.from({length:101},(_,i)=>({id:`task-${i}`}));
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>("src/app/api/workspace/tasks/route.ts",{
  "@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:false})},
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/db":{prisma:{workspaceTask:{findMany:async()=>rows}}},
  "@/lib/workspace-task-validation":{taskInput,taskRequestId},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/tasks"));const body=await response.json();
 assert.equal(body.tasks.length,100);assert.equal(body.nextCursor,"task-99");
});
test("shared task loader reads every page and does not return a partial result on failure",async()=>{
 const paths:string[]=[];
 const client=loadModule<{loadWorkspaceTasks():Promise<{id:string}[]>}>("src/lib/workspace-client.ts",{"./auth-refresh-client":{tryOAuthRefresh:async()=>false}},{
  fetch:async(path:string)=>{paths.push(path);return Response.json(path.includes("cursor=")?{tasks:[{id:"b"}],nextCursor:null}:{tasks:[{id:"a"}],nextCursor:"a"});},
 });
 assert.deepEqual((await client.loadWorkspaceTasks()).map(task=>task.id),["a","b"]);
 assert.deepEqual(paths,["/api/workspace/tasks","/api/workspace/tasks?cursor=a"]);
 const broken=loadModule<{loadWorkspaceTasks():Promise<unknown>}>("src/lib/workspace-client.ts",{"./auth-refresh-client":{tryOAuthRefresh:async()=>false}},{
  fetch:async(path:string)=>path.includes("cursor=")?Response.json({error:"offline"},{status:503}):Response.json({tasks:[{id:"a"}],nextCursor:"a"}),
 });
 await assert.rejects(broken.loadWorkspaceTasks(),/offline/);
});

test("task creation rejects inaccessible courses before writing",async()=>{
 let wrote=false;
 const route=loadModule<{POST(request:NextRequest):Promise<Response>}>("src/app/api/workspace/tasks/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:false})},
  "@/lib/db":{prisma:{workspaceTask:{upsert:async()=>{wrote=true;}}}},
  "@/lib/workspace-task-validation":{taskInput,taskRequestId},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/tasks",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"12345678-1234-4123-8123-123456789012"},body:JSON.stringify({title:"Test",courseId:"other-course"})}));
 assert.equal(response.status,403);assert.equal(wrote,false);
});

test("task lesson must belong to the selected class and be individually accessible",async()=>{
 let wrote=false, checkedSession="";
 const route=loadModule<{POST(request:NextRequest):Promise<Response>}>("src/app/api/workspace/tasks/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/courseware-access":{resolveCoursewareAccess:async(_identity:unknown,_course:string,lesson:string)=>{checkedSession=lesson;return {allowed:false};}},
  "@/lib/db":{prisma:{courseSession:{findFirst:async({where}:{where:{id:string;courseId:string}})=>where.courseId==="class-a"&&where.id==="lesson-a"?{id:where.id}:null},workspaceTask:{upsert:async()=>{wrote=true;}}}},
  "@/lib/workspace-task-validation":{taskInput,taskRequestId},
 });
 const request=(sessionId:string)=>new NextRequest("http://localhost/api/workspace/tasks",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"12345678"},body:JSON.stringify({title:"Test",courseId:"class-a",sessionId})});
 assert.equal((await route.POST(request("other-lesson"))).status,403);
 assert.equal((await route.POST(request("lesson-a"))).status,403);
 assert.equal(checkedSession,"lesson-a");assert.equal(wrote,false);
 assert.throws(()=>taskInput({title:"Test",sessionId:"lesson-a"}));
});

test("changing a task class clears its former lesson for older clients",async()=>{
 let update:Record<string,unknown>|undefined;
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/tasks/[id]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher-a"})},
  "@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:true})},
  "@/lib/db":{prisma:{workspaceTask:{findFirst:async()=>({courseId:"class-a",sessionId:"lesson-a"}),updateMany:async(args:{data:Record<string,unknown>})=>{update=args.data;return{count:1};}}}},
  "@/lib/workspace-task-validation":{taskInput},
 });
 const response=await route.PATCH(new NextRequest("http://localhost/api/workspace/tasks/task-a",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:1,title:"Test",courseId:"class-b"})}),{params:Promise.resolve({id:"task-a"})});
 assert.equal(response.status,200);assert.equal(update?.sessionId,null);
});
