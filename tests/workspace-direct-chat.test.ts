import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {chatCharacterCount,CLASSROOM_CHAT_MAX_CHARACTERS} from "../src/lib/classroom/chat-content";
import {taskRequestId} from "../src/lib/workspace-task-validation";

test("private messages reject nonparticipants without reading messages",async()=>{
 let queried=false;
 const route=loadModule<{GET(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/direct/[id]/messages/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"outsider"})},"@/lib/workspace-direct-chat":{authorizedDirectChat:async()=>null},
  "@/lib/db":{prisma:{workspaceDirectMessage:{findMany:async()=>{queried=true;return[];}}}},"@/lib/classroom/chat-content":{chatCharacterCount,CLASSROOM_CHAT_MAX_CHARACTERS},"@/lib/workspace-task-validation":{taskRequestId},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/direct/chat/messages"),{params:Promise.resolve({id:"chat"})});
 assert.equal(response.status,404);assert.equal(queried,false);
});
test("private messages are idempotent and scoped to the authenticated sender",async()=>{
 let args:unknown;
 const route=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/direct/[id]/messages/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student",name:"student",displayName:"Student"})},"@/lib/workspace-direct-chat":{authorizedDirectChat:async()=>({id:"chat"})},
  "@/lib/db":{prisma:{workspaceDirectMessage:{upsert:async(value:unknown)=>{args=value;return{content:"Hello"};}}}},"@/lib/classroom/chat-content":{chatCharacterCount,CLASSROOM_CHAT_MAX_CHARACTERS},"@/lib/workspace-task-validation":{taskRequestId},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/direct/chat/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:"Hello",clientId:"message-123",senderId:"other"})}),{params:Promise.resolve({id:"chat"})});
 assert.equal(response.status,201);assert.deepEqual((args as {where:unknown}).where,{chatId_senderId_clientId:{chatId:"chat",senderId:"student",clientId:"message-123"}});
});
test("conversation authorization checks membership and current course access",async()=>{
 let allowed=false;
 const {authorizedDirectChat}=loadModule<{authorizedDirectChat(session:{userId:string;name:string},id:string):Promise<unknown>}>("src/lib/workspace-direct-chat.ts",{
  "@/lib/db":{prisma:{workspaceDirectChat:{findUnique:async()=>({id:"chat",courseId:"course",participantA:"teacher",participantB:"student"})}}},
  "@/lib/courseware-access":{canAccessCourseware:async()=>allowed},"@/lib/casdoor-user":{casdoorUserIdsMatch:(a:string,b:string)=>a===b},
 });
 assert.equal(await authorizedDirectChat({userId:"outsider",name:"outsider"},"chat"),null);
 assert.equal(await authorizedDirectChat({userId:"student",name:"student"},"chat"),null);
 allowed=true;assert.ok(await authorizedDirectChat({userId:"student",name:"student"},"chat"));
});
test("new private conversations reject contacts outside the shared course",async()=>{
 let wrote=false;
 const route=loadModule<{POST(request:NextRequest):Promise<Response>}>("src/app/api/workspace/direct/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",name:"teacher"})},
  "@/lib/workspace-direct-chat":{directContacts:async()=>[{id:"student",name:"Student"}],directPrincipal:(s:string)=>s,directIsSelf:(session:{userId:string},id:string)=>session.userId===id},
  "@/lib/db":{prisma:{workspaceDirectChat:{upsert:async()=>{wrote=true;}}}},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/direct",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({courseId:"class",peerId:"outsider"})}));
 assert.equal(response.status,404);assert.equal(wrote,false);
});
test("contact list does not expose class members without course access",async()=>{
 let lookedUp=false;
 const {directContacts}=loadModule<{directContacts(session:{userId:string;name:string},id:string):Promise<unknown>}>("src/lib/workspace-direct-chat.ts",{
  "@/lib/db":{prisma:{course:{findUnique:async()=>{lookedUp=true;return null;}}}},
  "@/lib/courseware-access":{canAccessCourseware:async()=>false},"@/lib/casdoor-user":{casdoorUserIdsMatch:(a:string,b:string)=>a===b},
 });
 assert.equal(await directContacts({userId:"outsider",name:"outsider"},"class"),null);assert.equal(lookedUp,false);
});
test("private read marker refuses messages from a different conversation",async()=>{
 let wrote=false;
 const route=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/direct/[id]/read/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student"})},"@/lib/workspace-direct-chat":{authorizedDirectChat:async()=>({id:"chat"})},
  "@/lib/db":{prisma:{workspaceDirectMessage:{findFirst:async({where}:{where:unknown})=>{assert.deepEqual(where,{id:"foreign-message",chatId:"chat"});return null;}},$executeRaw:async()=>{wrote=true;}}},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/direct/chat/read",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messageId:"foreign-message"})}),{params:Promise.resolve({id:"chat"})});
 assert.equal(response.status,404);assert.equal(wrote,false);
});
