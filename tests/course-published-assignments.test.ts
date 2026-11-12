import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {taskRequestId} from "../src/lib/workspace-task-validation";
import {assignmentProgramId} from "../src/lib/course-assignment-draft";

test("published assignments are scoped to the authorized course and program",async()=>{
 let allowed=false,where:unknown,reads=0;
 const route=loadModule<{GET(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/published-assignments/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student",role:"student"})},"@/lib/course-program-resource":{resourceAccess:async()=>({allowed})},"@/lib/course-assignment-draft":{assignmentProgramId},
  "@/lib/db":{prisma:{coursePublishedAssignment:{findMany:async(args:{where:unknown})=>{where=args.where;reads++;return[];}}}},
 });
 const req=()=>new NextRequest("http://localhost/list?programId=p&unitId=u"),ctx={params:Promise.resolve({id:"course"})};
 assert.equal((await route.GET(req(),ctx)).status,403);assert.equal(reads,0);allowed=true;assert.equal((await route.GET(req(),ctx)).status,200);assert.deepEqual(where,{courseId:"course",programId:"p",unitId:"u"});
});

test("publication requires a teacher and confirms a matching immutable receipt",async()=>{
 let role="teacher",owned=true,prior:unknown=null,source:unknown={id:"draft",courseId:"course",version:2,title:"Work",description:"Instructions",dueDate:null,programId:null,unitId:null};
 const tx={course:{findUnique:async()=>owned?{id:"course"}:null},coursePublishedAssignment:{findUnique:async(args:{where:Record<string,unknown>})=>"sourceDraftId" in args.where?null:prior,create:async({data}:{data:unknown})=>({id:"published",publishedAt:new Date(),...data as object})},courseAssignmentDraft:{findFirst:async()=>source}};
 const route=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string;draftId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/[draftId]/publish/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role})},"@/lib/course-teacher":{userCanTeachCourse:()=>owned},"@/lib/workspace-task-validation":{taskRequestId},"@/lib/db":{prisma:{$transaction:async(fn:(value:unknown)=>Promise<unknown>)=>fn(tx)}},
 });
 const req=(version=2)=>new NextRequest("http://localhost/publish",{method:"POST",headers:{"Idempotency-Key":"request-123"},body:JSON.stringify({version})}),ctx={params:Promise.resolve({id:"course",draftId:"draft"})};
 role="student";assert.equal((await route.POST(req(),ctx)).status,403);role="teacher";owned=false;assert.equal((await route.POST(req(),ctx)).status,403);owned=true;
 const first=await route.POST(req(),ctx);assert.equal(first.status,200);assert.equal((await first.json()).assignment.title,"Work");
 prior={id:"published",sourceDraftId:"draft",sourceVersion:2,title:"Work",description:"Instructions",dueDate:null,programId:null,unitId:null,publishedAt:new Date()};source=null;
 assert.equal((await route.POST(req(),ctx)).status,200);assert.equal((await route.POST(req(3),ctx)).status,409);
});

test("publication status is visible only to authorized teachers",async()=>{
 let role="student",allowed=true,reads=0;
 const route=loadModule<{GET(request:NextRequest,context:{params:Promise<{id:string;draftId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/[draftId]/publish/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>allowed},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{coursePublishedAssignment:{findFirst:async(args:{where:unknown})=>{reads++;assert.deepEqual(args.where,{courseId:"course",sourceDraftId:"draft"});return{id:"publication"};}}}},
 });
 const ctx={params:Promise.resolve({id:"course",draftId:"draft"})},req=new NextRequest("http://localhost/status");
 assert.equal((await route.GET(req,ctx)).status,403);role="teacher";allowed=false;assert.equal((await route.GET(req,ctx)).status,403);assert.equal(reads,0);allowed=true;
 const result=await route.GET(req,ctx);assert.equal(result.status,200);assert.deepEqual(await result.json(),{published:true});
});
