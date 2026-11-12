import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest,NextResponse} from "next/server";
import {loadModule} from "./helpers/load-module";
import {classroomMessageAccess} from "../src/lib/classroom/server/message-access";

test("student preview requires a teacher, an ended lesson, and an authorized student",async()=>{
 let role="teacher",lesson:{status:string;endedAt:Date|null}|null={status:"finished",endedAt:new Date()},live=false,canManage=true;
 const calls:Array<{userId:string;role:string;kind:string}>=[];
 const actor=()=>({courseId:"course",sessionId:"lesson",userId:"teacher",displayName:"Teacher",role});
 const api=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{sessionId:string}>}):Promise<Response>}>("src/app/api/sessions/[sessionId]/replay-preview/route.ts",{
  "@/lib/classroom/server/activity-route":{activityActor:async()=>actor(),activityFailure:()=>NextResponse.json({error:"failed"},{status:500})},
  "@/lib/db":{prisma:{courseSession:{findFirst:async()=>lesson}}},
  "@/lib/classroom/server/message-access":{classroomMessageAccess},
  "@/lib/classroom/server/activities":{replayPreviewStudents:async(_a:unknown,id:string|null)=>({canManage,live,students:!id||id==="student-a"?[{userId:"student-a",displayName:"Student A"}]:[]}),activityOverview:async(a:{userId:string;role:string})=>{calls.push({...a,kind:"overview"});return {canManage:false,submissions:1};},activityDetail:async(a:{userId:string;role:string})=>{calls.push({...a,kind:"detail"});return{ownResponse:{userId:a.userId},responses:[]};}},
 });
 const ctx={params:Promise.resolve({sessionId:"lesson"})};const req=(query="")=>new NextRequest(`http://localhost/preview${query}`);
 role="student";assert.equal((await api.GET(req(),ctx)).status,403);assert.equal(calls.length,0);
 role="teacher";lesson={status:"scheduled",endedAt:null};assert.equal((await api.GET(req(),ctx)).status,404);
 lesson={status:"finished",endedAt:new Date()};live=true;assert.equal((await api.GET(req(),ctx)).status,403);live=false;
 canManage=false;assert.equal((await api.GET(req(),ctx)).status,403);canManage=true;
 assert.equal((await api.GET(req("?student=foreign"),ctx)).status,404);
 assert.equal((await api.GET(req("?activity=a"),ctx)).status,400);
 const list=await api.GET(req(),ctx);assert.deepEqual((await list.json()).students,[{userId:"student-a",displayName:"Student A"}]);assert.equal(list.headers.get("cache-control"),"private, no-store");
 const studentOverview=await api.GET(req("?student=student-a"),ctx);assert.equal(studentOverview.status,200);assert.deepEqual(await studentOverview.json(),{canManage:false,submissions:1});
 assert.ok(calls.some(call=>call.userId==="student-a"&&call.role==="student"&&call.kind==="overview"));
 const result=await api.GET(req("?student=student-a&activity=a"),ctx);assert.equal(result.status,200);assert.deepEqual(await result.json(),{ownResponse:{userId:"student-a"},responses:[]});
 assert.ok(calls.some(call=>call.userId==="student-a"&&call.role==="student"&&call.kind==="detail"));
 role="assistant";assert.equal((await api.GET(req("?student=student-a"),ctx)).status,200);
 role="observer";assert.equal((await api.GET(req("?student=student-a"),ctx)).status,403);
});

test("chat preview intersects teacher and student access and validates its cursor",async()=>{
 let where:unknown,findMany=0,cursorVisible=false;
 const actor={courseId:"course",sessionId:"lesson",userId:"teacher",displayName:"Teacher",role:"teacher"};
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{sessionId:string}>}):Promise<Response>}>("src/app/api/sessions/[sessionId]/replay-preview/route.ts",{
  "@/lib/classroom/server/activity-route":{activityActor:async()=>actor,activityFailure:()=>NextResponse.json({error:"failed"},{status:500})},
  "@/lib/classroom/server/message-access":{classroomMessageAccess},
  "@/lib/classroom/server/activities":{replayPreviewStudents:async(_a:unknown,id:string|null)=>({canManage:true,live:false,students:!id||id==="student-a"?[{userId:"student-a",displayName:"Student A"}]:[]})},
  "@/lib/db":{prisma:{courseSession:{findFirst:async()=>({status:"finished",endedAt:new Date()})},classroomMessage:{findFirst:async()=>cursorVisible?{id:"cursor"}:null,findMany:async(args:{where:unknown})=>{where=args.where;findMany++;return[{id:"m",senderName:"Teacher",scope:"classroom",kind:"text",content:"removed",deletedAt:new Date(),createdAt:new Date()}];}}}},
 });
 const ctx={params:Promise.resolve({sessionId:"lesson"})},req=(query:string)=>new NextRequest(`http://localhost/preview${query}`);
 assert.equal((await route.GET(req("?student=student-a&view=chat&before=foreign"),ctx)).status,400);assert.equal(findMany,0);
 cursorVisible=true;const result=await route.GET(req("?student=student-a&view=chat&before=cursor"),ctx);
 assert.equal(result.status,200);assert.deepEqual(where,{AND:[classroomMessageAccess("lesson","teacher","teacher"),classroomMessageAccess("lesson","student-a","student")]});
 assert.equal((await result.json()).messages[0].content,"");assert.equal(result.headers.get("cache-control"),"private, no-store");
 assert.equal((await route.GET(req("?student=foreign&view=chat"),ctx)).status,404);
 assert.equal((await route.GET(req("?student=student-a&view=chat&activity=x"),ctx)).status,400);
});
