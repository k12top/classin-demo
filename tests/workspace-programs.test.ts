import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {taskRequestId} from "../src/lib/workspace-task-validation";

test("lesson-only members list programs containing only their authorized lessons",async()=>{
 let where:unknown;
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/programs/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student",role:"student"})},
  "@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed:true,scope:"session",lessons:[{id:"allowed"}]})},
  "@/lib/course-teacher":{assertCanTeachCourse:async()=>false},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{courseProgram:{findMany:async(args:{where:unknown})=>{where=args.where;return[];}}}},
 });
 const result=await route.GET(new NextRequest("http://localhost/api/courses/c/programs"),{params:Promise.resolve({id:"c"})});
 assert.equal(result.status,200);assert.deepEqual(where,{courseId:"c",sessions:{some:{id:{in:["allowed"]}}}});
});

test("program creation rejects unauthorized users and mismatched idempotent retries",async()=>{
 let allowed=false,writes=0;
 const route=loadModule<{POST(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/programs/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/courseware-access":{},
  "@/lib/course-teacher":{assertCanTeachCourse:async()=>allowed},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{courseProgram:{upsert:async()=>{writes++;return{id:"p",name:"original"};}}}},
 });
 const request=()=>new NextRequest("http://localhost/api/courses/c/programs",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"12345678"},body:JSON.stringify({name:"different"})});
 const context={params:Promise.resolve({id:"c"})};assert.equal((await route.POST(request(),context)).status,403);assert.equal(writes,0);
 allowed=true;assert.equal((await route.POST(request(),context)).status,409);assert.equal(writes,1);
});

test("moving a lesson rejects a program from another class and checks the previous assignment",async()=>{
 let allowedProgram=false,where:unknown;
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string;sessionId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/sessions/[sessionId]/program/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},
  "@/lib/db":{prisma:{courseProgram:{findFirst:async({where}:{where:{courseId:string}})=>{assert.equal(where.courseId,"c");return allowedProgram?{id:"p"}:null;}},courseSession:{updateMany:async(args:{where:unknown})=>{where=args.where;return{count:0};}}}},
 });
 const request=()=>new NextRequest("http://localhost/api/courses/c/sessions/s/program",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({programId:"p",previousProgramId:null})});
 const context={params:Promise.resolve({id:"c",sessionId:"s"})};assert.equal((await route.PATCH(request(),context)).status,404);assert.equal(where,undefined);
 allowedProgram=true;assert.equal((await route.PATCH(request(),context)).status,409);assert.deepEqual(where,{id:"s",courseId:"c",programId:null});
});
