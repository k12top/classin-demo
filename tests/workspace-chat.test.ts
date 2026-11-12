import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {taskRequestId} from "../src/lib/workspace-task-validation";
import {chatCharacterCount,CLASSROOM_CHAT_MAX_CHARACTERS} from "../src/lib/classroom/chat-content";

const path="src/app/api/workspace/courses/[id]/messages/route.ts";
const chatContent={chatCharacterCount,CLASSROOM_CHAT_MAX_CHARACTERS};
type Route={GET:(request:NextRequest,context:{params:Promise<{id:string}>})=>Promise<Response>;POST:(request:NextRequest,context:{params:Promise<{id:string}>})=>Promise<Response>};
test("course conversation denies nonmembers before reading or writing messages",async()=>{
 let touched=false;
 const route=loadModule<Route>(path,{"@/lib/session":{getSessionFromRequest:async()=>({userId:"outsider"})},"@/lib/db":{prisma:{workspaceMessage:{findMany:async()=>{touched=true;return[];},upsert:async()=>{touched=true;}}}},"@/lib/courseware-access":{canAccessCourseware:async()=>false},"@/lib/classroom/chat-content":chatContent,"@/lib/workspace-task-validation":{taskRequestId}});
 const context={params:Promise.resolve({id:"class"})};
 assert.equal((await route.GET(new NextRequest("http://localhost/api/workspace/courses/class/messages"),context)).status,403);
 assert.equal((await route.POST(new NextRequest("http://localhost/api/workspace/courses/class/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:"hello",clientId:"request-123"})}),context)).status,403);
 assert.equal(touched,false);
});
test("message retry uses sender and class scoped idempotency and rejects changed content",async()=>{
 let upsert:unknown;
 const route=loadModule<Route>(path,{"@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",name:"Teacher"})},"@/lib/db":{prisma:{workspaceMessage:{upsert:async(args:unknown)=>{upsert=args;return{content:"earlier"};}}}},"@/lib/courseware-access":{canAccessCourseware:async()=>true},"@/lib/classroom/chat-content":chatContent,"@/lib/workspace-task-validation":{taskRequestId}});
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/courses/class/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:"changed",clientId:"request-123",senderId:"forged"})}),{params:Promise.resolve({id:"class"})});
 assert.equal(response.status,409);assert.deepEqual((upsert as {where:unknown}).where,{courseId_senderId_clientId:{courseId:"class",senderId:"teacher",clientId:"request-123"}});
});
test("forward sync returns oldest unseen messages first with a continuation cursor",async()=>{
 let query:unknown;const rows=Array.from({length:51},(_,i)=>({id:`message-${String(i).padStart(2,"0")}`}));
 const route=loadModule<Route>(path,{"@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher"})},"@/lib/db":{prisma:{workspaceMessage:{findFirst:async()=>({id:"previous"}),findMany:async(args:unknown)=>{query=args;return rows;}}}},"@/lib/courseware-access":{canAccessCourseware:async()=>true},"@/lib/classroom/chat-content":chatContent,"@/lib/workspace-task-validation":{taskRequestId}});
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/courses/class/messages?after=previous"),{params:Promise.resolve({id:"class"})});const body=await response.json();
 assert.equal(body.messages[0].id,"message-00");assert.equal(body.nextCursor,"message-49");
 assert.deepEqual((query as {orderBy:unknown}).orderBy,[{createdAt:"asc"},{id:"asc"}]);
});
test("a read marker cannot be advanced to a message from another course",async()=>{
 let where:unknown,wrote=false;
 const route=loadModule<{POST:(request:NextRequest,context:{params:Promise<{id:string}>})=>Promise<Response>}>("src/app/api/workspace/courses/[id]/messages/read/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher"})},"@/lib/courseware-access":{canAccessCourseware:async()=>true},
  "@/lib/db":{prisma:{workspaceMessage:{findFirst:async(args:{where:unknown})=>{where=args.where;return null;}},$executeRaw:async()=>{wrote=true;}}},
 });
 const response=await route.POST(new NextRequest("http://localhost/read",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messageId:"other"})}),{params:Promise.resolve({id:"class"})});
 assert.equal(response.status,404);assert.deepEqual(where,{id:"other",courseId:"class"});assert.equal(wrote,false);
});
test("unread counts and previews omit courses the user cannot access",async()=>{
 let countWhere:unknown,previewWhere:unknown;
 const route=loadModule<{POST:(request:NextRequest)=>Promise<Response>}>("src/app/api/workspace/chat/unread/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher"})},"@/lib/courseware-access":{canAccessCourseware:async(_session:unknown,id:string)=>id==="allowed"},
  "@/lib/db":{prisma:{workspaceChatRead:{findMany:async()=>[]},workspaceMessage:{count:async(args:{where:unknown})=>{countWhere=args.where;return 2;},findFirst:async(args:{where:unknown})=>{previewWhere=args.where;return {content:"latest",createdAt:"2026-01-01T00:00:00.000Z"};}}}},
 });
 const response=await route.POST(new NextRequest("http://localhost/unread",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({courseIds:["allowed","foreign"]})}));
 assert.deepEqual(await response.json(),{counts:{allowed:2},previews:{allowed:{content:"latest",createdAt:"2026-01-01T00:00:00.000Z"}}});assert.deepEqual(countWhere,{courseId:"allowed",senderId:{not:"teacher"}});assert.deepEqual(previewWhere,{courseId:"allowed"});
});
