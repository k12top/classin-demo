import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {assignmentProgramId} from "../src/lib/course-assignment-draft";
import {taskRequestId} from "../src/lib/workspace-task-validation";
import {driveName} from "../src/lib/workspace-drive";

test("unit listing only exposes units tied to visible lessons or published resources",async()=>{
 let where:unknown;
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/units/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student",role:"student"})},"@/lib/course-program-resource":{resourceAccess:async()=>({allowed:true,canManage:false})},"@/lib/courseware-access":{getCoursewareLessons:async()=>[{id:"mine"}]},"@/lib/course-assignment-draft":{assignmentProgramId},"@/lib/workspace-task-validation":{taskRequestId},"@/lib/workspace-drive":{driveName},
  "@/lib/db":{prisma:{courseProgramUnit:{findMany:async(args:{where:unknown})=>{where=args.where;return[];}}}},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/courses/c/units?programId=p"),{params:Promise.resolve({id:"c"})});
 assert.equal(response.status,200);assert.deepEqual(where,{courseId:"c",programId:"p",OR:[{sessions:{some:{id:{in:["mine"]}}}},{resources:{some:{status:"ready"}}},{publishedAssignments:{some:{}}}]});
});

test("unit placement refuses foreign targets and uses program plus prior unit for concurrency",async()=>{
 let target=false,written:unknown;
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/units/placement/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},"@/lib/course-assignment-draft":{assignmentProgramId},
  "@/lib/db":{prisma:{courseProgramUnit:{findFirst:async({where}:{where:unknown})=>{assert.deepEqual(where,{id:"target",courseId:"c",programId:"p"});return target?{id:"target"}:null;}},courseSession:{updateMany:async(args:unknown)=>{written=args;return{count:0};}}}},
 });
 const request=()=>new NextRequest("http://localhost/api/courses/c/units/placement",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"lesson",itemId:"lesson",programId:"p",unitId:"target",previousUnitId:null})});const ctx={params:Promise.resolve({id:"c"})};
 assert.equal((await route.PATCH(request(),ctx)).status,404);assert.equal(written,undefined);
 target=true;assert.equal((await route.PATCH(request(),ctx)).status,409);assert.deepEqual(written,{where:{id:"lesson",courseId:"c",programId:"p",unitId:null},data:{unitId:"target"}});
});

test("students cannot move course contents",async()=>{
 let touched=false;
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/units/placement/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"student",role:"student"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},"@/lib/course-assignment-draft":{assignmentProgramId},
  "@/lib/db":{prisma:{courseSession:{updateMany:async()=>{touched=true;}}}},
 });
 const response=await route.PATCH(new NextRequest("http://localhost/api/courses/c/units/placement",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"lesson",itemId:"x",programId:null,unitId:null,previousUnitId:null})}),{params:Promise.resolve({id:"c"})});assert.equal(response.status,403);assert.equal(touched,false);
});

test("removing a unit moves every kind of content within one transaction",async()=>{
 const operations:unknown[]=[];
 const tx={courseProgramUnit:{findFirst:async(args:unknown)=>{operations.push(["find",args]);return{id:"u",programId:"p"};},deleteMany:async(args:unknown)=>{operations.push(["delete",args]);return{count:1};}},courseSession:{updateMany:async(args:unknown)=>operations.push(["lesson",args])},courseProgramResource:{updateMany:async(args:unknown)=>operations.push(["resource",args])},courseAssignmentDraft:{updateMany:async(args:unknown)=>operations.push(["draft",args])},coursePublishedAssignment:{updateMany:async(args:unknown)=>operations.push(["published",args])}};
 const route=loadModule<{DELETE(request:NextRequest,ctx:{params:Promise<{id:string;unitId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/units/[unitId]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},"@/lib/workspace-drive":{driveName},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>,options:unknown)=>{assert.deepEqual(options,{isolationLevel:"Serializable"});return fn(tx);}}},
 });
 const response=await route.DELETE(new NextRequest("http://localhost/api/courses/c/units/u",{method:"DELETE",body:JSON.stringify({version:2})}),{params:Promise.resolve({id:"c",unitId:"u"})});
 assert.equal(response.status,200);const where={courseId:"c",programId:"p",unitId:"u"};assert.deepEqual(operations,[["find",{where:{id:"u",courseId:"c",version:2},select:{id:true,programId:true}}],["lesson",{where,data:{unitId:null}}],["resource",{where,data:{unitId:null}}],["draft",{where,data:{unitId:null,version:{increment:1}}}],["published",{where,data:{unitId:null}}],["delete",{where:{id:"u",courseId:"c",version:2}}]]);
});

test("unit removal rejects students and stale versions without moving content",async()=>{
 let role="student",moved=false;
 const route=loadModule<{DELETE(request:NextRequest,ctx:{params:Promise<{id:string;unitId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/units/[unitId]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},"@/lib/workspace-drive":{driveName},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn({courseProgramUnit:{findFirst:async()=>null},courseSession:{updateMany:async()=>{moved=true;}}})}},
 });
 const request=()=>new NextRequest("http://localhost/api/courses/c/units/u",{method:"DELETE",body:JSON.stringify({version:0})});const ctx={params:Promise.resolve({id:"c",unitId:"u"})};
 assert.equal((await route.DELETE(request(),ctx)).status,403);role="teacher";assert.equal((await route.DELETE(request(),ctx)).status,409);assert.equal(moved,false);
});

test("unit reorder is scoped to the course and rejects stale or unauthorized requests",async()=>{
 let role="teacher",existing=[{id:"a"},{id:"b"}];const writes:unknown[]=[];
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/units/order/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>true},"@/lib/course-assignment-draft":{assignmentProgramId},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>,options:unknown)=>{assert.deepEqual(options,{isolationLevel:"Serializable"});return fn({courseProgramUnit:{findMany:async(args:unknown)=>{assert.deepEqual(args,{where:{courseId:"c",programId:"p"},select:{id:true},orderBy:[{sortOrder:"asc"},{createdAt:"asc"},{id:"asc"}]});return existing;},updateMany:async(args:unknown)=>{writes.push(args);return{count:1};}}});}}},
 });
 const request=()=>new NextRequest("http://localhost/api/courses/c/units/order",{method:"PATCH",body:JSON.stringify({programId:"p",ids:["a","b"],unitId:"b",direction:"up"})});const ctx={params:Promise.resolve({id:"c"})};
 role="student";assert.equal((await route.PATCH(request(),ctx)).status,403);role="teacher";existing=[{id:"b"},{id:"a"}];assert.equal((await route.PATCH(request(),ctx)).status,409);assert.deepEqual(writes,[]);
 existing=[{id:"a"},{id:"b"}];assert.equal((await route.PATCH(request(),ctx)).status,200);assert.deepEqual(writes,[{where:{id:"b",courseId:"c",programId:"p"},data:{sortOrder:-2,version:{increment:1}}},{where:{id:"a",courseId:"c",programId:"p"},data:{sortOrder:-1,version:{increment:1}}}]);
});
