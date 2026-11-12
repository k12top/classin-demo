import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {classroomMessageAccess} from "../src/lib/classroom/server/message-access";

const ctx={params:Promise.resolve({sessionId:"lesson"})};
test("replay chat denies access before querying any messages",async()=>{
 let queried=false;
 const route=loadModule<{GET(request:NextRequest,context:typeof ctx):Promise<Response>}>("src/app/api/sessions/[sessionId]/replay-messages/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"outsider"})},"@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:false})},"@/lib/classroom/server/message-access":{classroomMessageAccess},
  "@/lib/db":{prisma:{courseSession:{findUnique:async()=>({courseId:"course"})},classroomMessage:{findMany:async()=>{queried=true;return[];}}}},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/sessions/lesson/replay-messages"),ctx);
 assert.equal(response.status,403);assert.equal(queried,false);
});
test("student replay chat uses live visibility and redacts withdrawn content",async()=>{
 let where:unknown;
 const route=loadModule<{GET(request:NextRequest,context:typeof ctx):Promise<Response>}>("src/app/api/sessions/[sessionId]/replay-messages/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student"})},"@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:true,teaching:false})},"@/lib/classroom/server/message-access":{classroomMessageAccess},
  "@/lib/db":{prisma:{courseSession:{findUnique:async()=>({courseId:"course"})},classroomMessage:{findMany:async(args:{where:unknown})=>{where=args.where;return[{id:"message",senderName:"Teacher",scope:"classroom",kind:"text",content:"secret removed",deletedAt:new Date(),createdAt:new Date("2026-11-08T00:00:00Z")}];}}}},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/sessions/lesson/replay-messages"),ctx);const body=await response.json();
 assert.equal(response.status,200);assert.deepEqual(where,classroomMessageAccess("lesson","student","student"));assert.equal(body.messages[0].content,"");assert.equal(body.messages[0].deleted,true);
});
test("explicit observer replay uses public message visibility even with inherited teacher access",async()=>{
 let where:unknown;
 const route=loadModule<{GET(request:NextRequest,context:typeof ctx):Promise<Response>}>("src/app/api/sessions/[sessionId]/replay-messages/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"viewer"})},"@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:true,teaching:false,observer:true})},"@/lib/classroom/server/message-access":{classroomMessageAccess},
  "@/lib/db":{prisma:{courseSession:{findUnique:async()=>({courseId:"course"})},classroomMessage:{findMany:async(args:{where:unknown})=>{where=args.where;return[];}}}},
 });
 assert.equal((await route.GET(new NextRequest("http://localhost/api/sessions/lesson/replay-messages"),ctx)).status,200);
 assert.deepEqual(where,{sessionId:"lesson",scope:"classroom"});
});
test("replay cursor must be visible to the requesting student",async()=>{
 let queried=false;
 const route=loadModule<{GET(request:NextRequest,context:typeof ctx):Promise<Response>}>("src/app/api/sessions/[sessionId]/replay-messages/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student"})},"@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:true,teaching:false})},"@/lib/classroom/server/message-access":{classroomMessageAccess},
  "@/lib/db":{prisma:{courseSession:{findUnique:async()=>({courseId:"course"})},classroomMessage:{findFirst:async()=>null,findMany:async()=>{queried=true;return[];}}}},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/sessions/lesson/replay-messages?before=foreign"),ctx);
 assert.equal(response.status,400);assert.equal(queried,false);
});
test("replay images never read object storage for an inaccessible message",async()=>{
 let read=false;
 const route=loadModule<{GET(request:NextRequest,context:{params:Promise<{sessionId:string;messageId:string}>}):Promise<Response>}>("src/app/api/sessions/[sessionId]/replay-messages/[messageId]/image/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student"})},"@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:true,teaching:false})},"@/lib/classroom/server/message-access":{classroomMessageAccess},
  "@/lib/classroom/chat-image-message":{parseImageMessage:()=>null},"@/lib/classroom/server/chat-images":{readChatImageObject:async()=>{read=true;}},
  "@/lib/db":{prisma:{courseSession:{findUnique:async()=>({courseId:"course"})},classroomMessage:{findFirst:async()=>null}}},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/sessions/lesson/replay-messages/foreign/image"),{params:Promise.resolve({sessionId:"lesson",messageId:"foreign"})});
 assert.equal(response.status,404);assert.equal(read,false);
});
