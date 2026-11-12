import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {assignmentDraftInput,assignmentProgramId} from "../src/lib/course-assignment-draft";
import {taskRequestId} from "../src/lib/workspace-task-validation";

test("assignment draft validates text and calendar dates",()=>{
 assert.deepEqual(assignmentDraftInput({title:" Prepare ",description:"Notes",dueDate:"2028-02-29"}),{title:"Prepare",description:"Notes",dueDate:"2028-02-29"});
 assert.throws(()=>assignmentDraftInput({title:"",description:""}));assert.throws(()=>assignmentDraftInput({title:"x",description:"",dueDate:"2026-02-30"}));assert.throws(()=>assignmentDraftInput({title:"x".repeat(81),description:""}));
});

test("creation replay keeps its receipt after a draft is edited, moved or deleted",async()=>{
 let draft:{id:string;courseId:string;title:string;programId:string|null;unitId:string|null}|null={id:"draft",courseId:"course",title:"Edited",programId:"other",unitId:null};
 const receipt={courseId:"course",creatorId:"teacher",requestId:"request-123",draftId:"draft",programId:null,unitId:null,title:"Original",description:"",dueDate:null};
 let writes=0;
 const route=loadModule<{POST(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},
  "@/lib/course-assignment-draft":{assignmentDraftInput,assignmentProgramId},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{courseAssignmentCreationReceipt:{findUnique:async()=>receipt},courseAssignmentDraft:{findFirst:async()=>draft},$transaction:async()=>{writes++;}}},
 });
 const request=(title="Original")=>new NextRequest("http://localhost/draft",{method:"POST",headers:{"Idempotency-Key":"request-123","X-Assignment-Recovery":"1"},body:JSON.stringify({title,description:"",dueDate:null})});
 const ctx={params:Promise.resolve({id:"course"})};
 const changed=await route.POST(request(),ctx);assert.equal(changed.status,200);assert.equal((await changed.json()).draft.title,"Edited");
 assert.equal((await route.POST(request("Different"),ctx)).status,409);
 draft=null;const deleted=await route.POST(request(),ctx);assert.equal(deleted.status,200);assert.deepEqual(await deleted.json(),{draft:null,deleted:true});assert.equal(writes,0);
});

test("students cannot read or create teacher-only drafts",async()=>{
 let reads=0;
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>;POST(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student",role:"student"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},
  "@/lib/course-assignment-draft":{assignmentDraftInput,assignmentProgramId},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{courseAssignmentDraft:{findMany:async()=>{reads++;return[];},upsert:async()=>{reads++;}}}},
 });
 const ctx={params:Promise.resolve({id:"course"})};
 assert.equal((await route.GET(new NextRequest("http://localhost/api/courses/course/assignments"),ctx)).status,403);
 assert.equal((await route.POST(new NextRequest("http://localhost/api/courses/course/assignments",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"12345678"},body:JSON.stringify({title:"Draft",description:""})}),ctx)).status,403);
 assert.equal(reads,0);
});

test("all-program draft reads remain course-scoped and teacher-only",async()=>{
 let role="teacher",allowed=true,reads=0;const scopes:unknown[]=[];
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>allowed},
  "@/lib/course-assignment-draft":{assignmentDraftInput,assignmentProgramId},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{courseAssignmentDraft:{findFirst:async({where}:{where:unknown})=>{scopes.push(where);return{id:"cursor"};},findMany:async({where}:{where:unknown})=>{reads++;scopes.push(where);return[];}}}},
 });
 const ctx={params:Promise.resolve({id:"course-a"})},request=(query:string)=>new NextRequest(`http://localhost/api/courses/course-a/assignments?${query}`);
 assert.equal((await route.GET(request("allPrograms=1&cursor=cursor"),ctx)).status,200);
 assert.deepEqual(scopes,[{id:"cursor",courseId:"course-a"},{courseId:"course-a"}]);
 assert.equal((await route.GET(request("allPrograms=1&programId=p"),ctx)).status,400);
 assert.equal((await route.GET(request("allPrograms=1&unitId=u"),ctx)).status,400);
 role="student";assert.equal((await route.GET(request("allPrograms=1"),ctx)).status,403);
 role="teacher";allowed=false;assert.equal((await route.GET(request("allPrograms=1"),ctx)).status,403);assert.equal(reads,1);
});

test("direct draft reads require the class teacher and match the class id",async()=>{
 let role="teacher",allowed=true,where:unknown,reads=0;
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{id:string;draftId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/[draftId]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>allowed},
  "@/lib/course-assignment-draft":{assignmentDraftInput},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{courseAssignmentDraft:{findFirst:async(args:{where:unknown})=>{reads++;where=args.where;return null;}}}},
 });
 const ctx={params:Promise.resolve({id:"course-a",draftId:"draft-b"})},req=new NextRequest("http://localhost/draft");
 assert.equal((await route.GET(req,ctx)).status,404);assert.deepEqual(where,{id:"draft-b",courseId:"course-a"});
 role="student";assert.equal((await route.GET(req,ctx)).status,403);
 role="teacher";allowed=false;assert.equal((await route.GET(req,ctx)).status,403);assert.equal(reads,1);
});

test("draft deletion requires class teaching access and the current version",async()=>{
 let role="teacher",allowed=true,count=1,writes=0,where:unknown;
 const route=loadModule<{DELETE(request:NextRequest,ctx:{params:Promise<{id:string;draftId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/[draftId]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>allowed},
  "@/lib/course-assignment-draft":{assignmentDraftInput},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{courseAssignmentDraft:{deleteMany:async(args:{where:unknown})=>{writes++;where=args.where;return{count};}}}},
 });
 const ctx={params:Promise.resolve({id:"course-a",draftId:"draft-b"})};
 const req=(version:unknown)=>new NextRequest("http://localhost/draft",{method:"DELETE",body:JSON.stringify({version})});
 assert.equal((await route.DELETE(req(-1),ctx)).status,400);
 role="student";assert.equal((await route.DELETE(req(2),ctx)).status,403);
 role="teacher";allowed=false;assert.equal((await route.DELETE(req(2),ctx)).status,403);assert.equal(writes,0);
 allowed=true;count=0;assert.equal((await route.DELETE(req(2),ctx)).status,409);
 assert.deepEqual(where,{id:"draft-b",courseId:"course-a",version:2});
 count=1;assert.equal((await route.DELETE(req(2),ctx)).status,200);
});

test("drafts reject a foreign program and protect edits from lost updates",async()=>{
 let writes=0,where:unknown;
 const common={"@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},"@/lib/course-assignment-draft":{assignmentDraftInput,assignmentProgramId},"@/lib/workspace-task-validation":{taskRequestId},"@/lib/db":{prisma:{courseAssignmentCreationReceipt:{findUnique:async()=>null},courseProgram:{findFirst:async()=>null},courseAssignmentDraft:{upsert:async()=>{writes++;},updateMany:async(args:{where:unknown})=>{where=args.where;return{count:0};},findFirst:async()=>null}}}};
 const create=loadModule<{POST(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/route.ts",common);
 const context={params:Promise.resolve({id:"course"})};
 assert.equal((await create.POST(new NextRequest("http://localhost/api/courses/course/assignments",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"12345678"},body:JSON.stringify({title:"Draft",description:"",programId:"foreign"})}),context)).status,404);assert.equal(writes,0);
 const edit=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string;draftId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/assignments/[draftId]/route.ts",common);
 assert.equal((await edit.PATCH(new NextRequest("http://localhost/api/courses/course/assignments/draft",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:"Draft",description:"",version:2})}),{params:Promise.resolve({id:"course",draftId:"draft"})})).status,409);
 assert.deepEqual(where,{id:"draft",courseId:"course",version:2});
});

test("edit replay requires the original teacher, request id, version and content",async()=>{
 let actor="teacher-a";
 const row={id:"draft",programId:null,unitId:null,title:"Before",description:"",dueDate:null as string|null,version:0,lastEditRequestId:null as string|null,lastEditActorId:null as string|null};
 const table={updateMany:async({where,data}:{where:{version:number};data:{title:string;description:string;dueDate:string|null;lastEditRequestId:string|null;lastEditActorId:string|null}})=>{if(where.version!==row.version)return{count:0};Object.assign(row,data,{version:row.version+1});return{count:1};},findFirst:async()=>({...row})};
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string;draftId:string}>}):Promise<Response>}>('src/app/api/courses/[id]/assignments/[draftId]/route.ts',{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:actor,role:"teacher"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},"@/lib/course-assignment-draft":{assignmentDraftInput},"@/lib/workspace-task-validation":{taskRequestId},"@/lib/db":{prisma:{courseAssignmentDraft:table}},
 });
 const req=(title="After",key="request-1")=>new NextRequest('http://localhost/draft',{method:'PATCH',headers:{'Idempotency-Key':key},body:JSON.stringify({title,description:"",dueDate:null,version:0})});const ctx={params:Promise.resolve({id:"course",draftId:"draft"})};
 assert.equal((await route.PATCH(req(),ctx)).status,200);const replay=await route.PATCH(req(),ctx);assert.equal(replay.status,200);assert.equal((await replay.json()).draft.lastEditRequestId,undefined);assert.equal(row.version,1);
 assert.equal((await route.PATCH(req("Different"),ctx)).status,409);assert.equal((await route.PATCH(req("After","request-2"),ctx)).status,409);
 actor="teacher-b";assert.equal((await route.PATCH(req(),ctx)).status,409);
});
