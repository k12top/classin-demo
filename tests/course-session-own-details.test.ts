import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {isExplicitInstant,validTimeZone} from "../src/lib/time-zone";

test("single-lesson edit requires the effective lead and uses a versioned scheduled update",async()=>{
 let role="teacher",kind="teacher",memberRole="teacher",count=1,written:unknown;
 const tx={courseSession:{findFirst:async()=>({seriesId:"series"}),updateMany:async(args:unknown)=>{written=args;return{count};}}};
 const route=loadModule<{PATCH(r:NextRequest,c:{params:Promise<{id:string;sessionId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/sessions/[sessionId]/own-details/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"member",name:"member",role})},"@/lib/course-teacher":{casdoorUserIdCandidates:(id:string)=>[id]},"@/lib/course-session-roster":{getEffectiveSessionRoster:async()=>({courseId:"c"}),rosterContainsUser:()=>({kind,member:{role:memberRole}})},"@/lib/time-zone":{isExplicitInstant,validTimeZone},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>,opts:unknown)=>{assert.deepEqual(opts,{isolationLevel:"Serializable"});return fn(tx);}}},
 });
 const request=(overrides:Record<string,unknown>={})=>new NextRequest("http://localhost/api/test",{method:"PATCH",body:JSON.stringify({title:"Lesson",timezone:"Asia/Shanghai",startTime:"2035-01-01T10:00:00.000Z",endTime:"2035-01-01T11:00:00.000Z",updatedAt:"2034-01-01T00:00:00.000Z",...overrides})});const ctx={params:Promise.resolve({id:"c",sessionId:"s"})};
 assert.equal((await route.PATCH(request({endTime:"2035-01-01T10:01:00.000Z"}),ctx)).status,400);
 role="student";assert.equal((await route.PATCH(request(),ctx)).status,403);role="teacher";memberRole="assistant";assert.equal((await route.PATCH(request(),ctx)).status,403);memberRole="teacher";kind="student";assert.equal((await route.PATCH(request(),ctx)).status,403);kind="teacher";
 count=0;assert.equal((await route.PATCH(request(),ctx)).status,409);count=1;assert.equal((await route.PATCH(request(),ctx)).status,200);
 assert.deepEqual(written,{where:{id:"s",courseId:"c",status:"scheduled",endedAt:null,updatedAt:new Date("2034-01-01T00:00:00.000Z")},data:{title:"Lesson",startTime:new Date("2035-01-01T10:00:00.000Z"),endTime:new Date("2035-01-01T11:00:00.000Z"),timezone:"Asia/Shanghai",isDetached:true}});
});
