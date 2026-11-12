import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";

type Route={POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>};
for(const kind of ["course","direct"] as const){
 const path=kind==="course"?"src/app/api/workspace/courses/[id]/messages/translate/route.ts":"src/app/api/workspace/direct/[id]/translate/route.ts";
 test(`${kind} translation checks access and scopes messages before sending them to the service`,async()=>{
  let allowed=false,translated:unknown;const queries:unknown[]=[];
  const findMany=async(args:unknown)=>{queries.push(args);return [{id:"m1",content:"你好"}];};
  const route=loadModule<Route>(path,{
   "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher"})},
   "@/lib/db":{prisma:{workspaceMessage:{findMany},workspaceDirectMessage:{findMany}}},
   "@/lib/courseware-access":{canAccessCourseware:async()=>allowed},"@/lib/workspace-direct-chat":{authorizedDirectChat:async()=>allowed},
   "@/lib/classroom/languages":{captionLanguageOptions:()=>[{code:"en-US"}]},
   "@/lib/classroom/server/message-translation":{chatTranslationConfig:()=>({model:"fixture"}),translateChatText:async(messages:unknown,language:string)=>{translated={messages,language};return {m1:"Hello"};}},
  });
  const request=()=>new NextRequest("http://localhost/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messageIds:["m1","other"],language:"en-US"})});
  const context={params:Promise.resolve({id:"room-a"})};
  assert.ok([403,404].includes((await route.POST(request(),context)).status));assert.equal(queries.length,0);assert.equal(translated,undefined);
  allowed=true;const response=await route.POST(request(),context);assert.equal(response.status,200);assert.deepEqual(await response.json(),{translations:{m1:"Hello"}});
  assert.equal(queries.length,2);
  assert.deepEqual((queries[0] as {where:unknown}).where,{[kind==="course"?"courseId":"chatId"]:"room-a",id:{in:["m1","other"]}});
  assert.deepEqual((queries[1] as {where:unknown}).where,{[kind==="course"?"courseId":"chatId"]:"room-a",id:{in:["m1"]}});
  assert.deepEqual(translated,{messages:[{id:"m1",content:"你好"}],language:"en-US"});
 });
 test(`${kind} translation distinguishes unavailable configuration after authorization`,async()=>{
  let allowed=false,reads=0;
  const route=loadModule<Route>(path,{
   "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher"})},
   "@/lib/db":{prisma:{workspaceMessage:{findMany:async()=>{reads++;return[];}},workspaceDirectMessage:{findMany:async()=>{reads++;return[];}}}},
   "@/lib/courseware-access":{canAccessCourseware:async()=>allowed},"@/lib/workspace-direct-chat":{authorizedDirectChat:async()=>allowed},
   "@/lib/classroom/languages":{captionLanguageOptions:()=>[{code:"en-US"}]},
   "@/lib/classroom/server/message-translation":{chatTranslationConfig:()=>null,translateChatText:async()=>({})},
  });
  const request=()=>new NextRequest("http://localhost/translate",{method:"POST",body:JSON.stringify({messageIds:["m1"],language:"en-US"})}),context={params:Promise.resolve({id:"room-a"})};
  assert.ok([403,404].includes((await route.POST(request(),context)).status));
  allowed=true;const response=await route.POST(request(),context);assert.equal(response.status,503);assert.equal((await response.json()).code,"TRANSLATION_NOT_CONFIGURED");assert.equal(reads,0);
 });
}
