import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {driveName} from "../src/lib/workspace-drive";
import {assignmentProgramId} from "../src/lib/course-assignment-draft";
import {taskRequestId} from "../src/lib/workspace-task-validation";

test("program resources require an authorized lesson in the same program",async()=>{
 let where:unknown;
 const access=loadModule<{resourceAccess(user:unknown,course:string,program:string|null):Promise<{allowed:boolean}>}>("src/lib/course-program-resource.ts",{
  "server-only":{},"@/lib/course-teacher":{assertCanTeachCourse:async()=>false},"@/lib/courseware-access":{getCoursewareLessons:async()=>[{id:"allowed-lesson"}]},
  "@/lib/db":{prisma:{courseSession:{count:async(args:{where:unknown})=>{where=args.where;return 0;}}}},
 });
 assert.equal((await access.resourceAccess({role:"student",userId:"student"},"course","program")).allowed,false);
 assert.deepEqual(where,{courseId:"course",programId:"program",id:{in:["allowed-lesson"]}});
});

test("adding resources checks teacher permission and ownership before copying",async()=>{
 let canManage=false,ownerQuery:unknown,copied=0;
 const route=loadModule<{POST(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/resources/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},
  "@/lib/course-program-resource":{resourceAccess:async()=>({canManage}),programResourceKey:()=>"new-key",resourceSelect:{}},
  "@/lib/workspace-drive":{driveName},"@/lib/course-assignment-draft":{assignmentProgramId},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/aliyun-oss":{getCoursewareOssClient:()=>({copy:async()=>{copied++;}})},
  "@/lib/db":{prisma:{courseProgramResource:{findUnique:async()=>null},workspaceDriveItem:{findFirst:async(args:{where:unknown})=>{ownerQuery=args.where;return null;}}}},
 });
 const req=()=>new NextRequest("http://localhost/api/courses/c/resources",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"12345678"},body:JSON.stringify({sourceId:"foreign-file",name:"test.pdf",programId:null})});
 const ctx={params:Promise.resolve({id:"c"})};assert.equal((await route.POST(req(),ctx)).status,403);assert.equal(ownerQuery,undefined);
 canManage=true;assert.equal((await route.POST(req(),ctx)).status,404);assert.deepEqual(ownerQuery,{id:"foreign-file",userId:"teacher",status:"ready",kind:"file"});assert.equal(copied,0);
});

test("resource download denies access before fetching object bytes",async()=>{
 let fetched=false;
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{id:string;resourceId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/resources/[resourceId]/file/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"other",role:"student"})},"@/lib/course-program-resource":{resourceAccess:async()=>({allowed:false})},
  "@/lib/courseware-file-response":{coursewareFileResponse:async()=>{fetched=true;return new Response("bad");}},
  "@/lib/db":{prisma:{courseProgramResource:{findFirst:async()=>({programId:"p",name:"test.pdf",objectKey:"key"})}}},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/courses/c/resources/r/file"),{params:Promise.resolve({id:"c",resourceId:"r"})});assert.equal(response.status,404);assert.equal(fetched,false);
});

test("resource retries reuse the same destination and never copy changed inputs",async()=>{
 let item:Record<string,unknown>|null=null,copies=0;
 const table={findUnique:async()=>item,findUniqueOrThrow:async()=>item,upsert:async({create}:{create:Record<string,unknown>})=>{item={...create,id:"resource",status:"pending",createdAt:new Date()};return item;},updateMany:async()=>{if(item?.status==="pending")item={...item,status:"ready"};return{count:1};}};
 const route=loadModule<{POST(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/resources/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/course-program-resource":{resourceAccess:async()=>({canManage:true}),programResourceKey:()=>"stable-key",resourceSelect:{}},
  "@/lib/workspace-drive":{driveName},"@/lib/course-assignment-draft":{assignmentProgramId},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/aliyun-oss":{getCoursewareOssClient:()=>({copy:async(destination:string,source:string)=>{assert.equal(destination,"stable-key");assert.equal(source,"source-key");if(++copies===1)throw new Error("response lost");}})},
  "@/lib/db":{prisma:{courseProgramResource:table,workspaceDriveItem:{findFirst:async()=>({objectKey:"source-key",size:3})}}},
 });
 const req=(name:string)=>new NextRequest("http://localhost/api/courses/c/resources",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"12345678"},body:JSON.stringify({sourceId:"file",name,programId:null})});const ctx={params:Promise.resolve({id:"c"})};
 assert.equal((await route.POST(req("test.pdf"),ctx)).status,503);
 assert.equal((await route.POST(req("different.pdf"),ctx)).status,409);assert.equal(copies,1);
 assert.equal((await route.POST(req("test.pdf"),ctx)).status,201);assert.equal((await route.POST(req("test.pdf"),ctx)).status,201);assert.equal(copies,2);
});

test("resource removal checks permissions and stale state and is retryable",async()=>{
 let manage=false;
 const item={programId:"p",unitId:"u",name:"lesson.pdf",status:"ready"};
 const table={findFirst:async({where}:{where:Record<string,unknown>})=>where.status&&where.status!==item.status?null:{...item,id:"r"},updateMany:async({where}:{where:Record<string,unknown>})=>{if(where.status!==item.status||where.name!==item.name||where.unitId!==item.unitId)return{count:0};item.status="removed";return{count:1};}};
 const route=loadModule<{DELETE(request:NextRequest,ctx:{params:Promise<{id:string;resourceId:string}>}):Promise<Response>}>('src/app/api/courses/[id]/resources/[resourceId]/route.ts',{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role:"teacher"})},"@/lib/course-program-resource":{resourceAccess:async()=>({canManage:manage}),resourceSelect:{}},"@/lib/workspace-drive":{driveName},"@/lib/db":{prisma:{courseProgramResource:table}},
 });
 const req=(name="lesson.pdf",unitId="u")=>new NextRequest('http://localhost/api/courses/c/resources/r',{method:'DELETE',body:JSON.stringify({previousName:name,programId:"p",unitId})});
 const ctx={params:Promise.resolve({id:"c",resourceId:"r"})};
 assert.equal((await route.DELETE(req(),ctx)).status,404);assert.equal(item.status,"ready");
 manage=true;assert.equal((await route.DELETE(req("old.pdf"),ctx)).status,409);assert.equal((await route.DELETE(req("lesson.pdf","other"),ctx)).status,409);
 assert.equal((await route.DELETE(req(),ctx)).status,200);assert.equal(item.status,"removed");assert.equal((await route.DELETE(req(),ctx)).status,200);
});

test("a late copy retry cannot republish a removed resource",async()=>{
 const item={id:"r",courseId:"c",creatorId:"teacher",requestId:"12345678",sourceId:"file",sourceObjectKey:"source",objectKey:"destination",programId:null,unitId:null,name:"test.pdf",status:"pending",size:3,createdAt:new Date()};
 let copies=0;
 const table={findUnique:async()=>({...item}),findUniqueOrThrow:async()=>({...item}),updateMany:async({where}:{where:{status:string}})=>{if(item.status===where.status)item.status="ready";return{count:1};}};
 const route=loadModule<{POST(request:NextRequest,ctx:{params:Promise<{id:string}>}):Promise<Response>}>('src/app/api/courses/[id]/resources/route.ts',{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/course-program-resource":{resourceAccess:async()=>({canManage:true}),programResourceKey:()=>"destination",resourceSelect:{}},"@/lib/workspace-drive":{driveName},"@/lib/course-assignment-draft":{assignmentProgramId},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/aliyun-oss":{getCoursewareOssClient:()=>({copy:async()=>{copies++;item.status="removed";}})},"@/lib/db":{prisma:{courseProgramResource:table}},
 });
 const req=()=>new NextRequest('http://localhost/api/courses/c/resources',{method:'POST',headers:{'Idempotency-Key':'12345678'},body:JSON.stringify({sourceId:'file',name:'test.pdf',programId:null})});const ctx={params:Promise.resolve({id:'c'})};
 assert.equal((await route.POST(req(),ctx)).status,409);assert.equal(item.status,'removed');
 assert.equal((await route.POST(req(),ctx)).status,409);assert.equal(copies,1);
});

test("resource rename checks access, extension and previous name",async()=>{
 let manage=false,where:unknown,changed=0;
 const route=loadModule<{PATCH(request:NextRequest,ctx:{params:Promise<{id:string;resourceId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/resources/[resourceId]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role:"teacher"})},"@/lib/course-program-resource":{resourceAccess:async()=>({canManage:manage}),resourceSelect:{}},"@/lib/workspace-drive":{driveName},
  "@/lib/db":{prisma:{courseProgramResource:{findFirst:async()=>({programId:"p"}),updateMany:async(args:{where:unknown})=>{where=args.where;return{count:changed};}}}},
 });
 const req=(name:string)=>new NextRequest("http://localhost/api/courses/c/resources/r",{method:"PATCH",body:JSON.stringify({name,previousName:"lesson.pdf"})});const ctx={params:Promise.resolve({id:"c",resourceId:"r"})};
 assert.equal((await route.PATCH(req("lesson.html"),ctx)).status,400);assert.equal((await route.PATCH(req("renamed.pdf"),ctx)).status,404);assert.equal(where,undefined);
 manage=true;assert.equal((await route.PATCH(req("renamed.pdf"),ctx)).status,409);assert.deepEqual(where,{id:"r",courseId:"c",programId:"p",status:"ready",name:"lesson.pdf"});changed=1;assert.equal((await route.PATCH(req("renamed.pdf"),ctx)).status,200);
});

test("rename verification only returns the current resource to an authorized manager",async()=>{
 let manage=false,exists=true;
 const item={id:"r",name:"renamed.pdf",programId:"p",unitId:null,size:10,status:"ready"};
 const route=loadModule<{GET(request:NextRequest,ctx:{params:Promise<{id:string;resourceId:string}>}):Promise<Response>}>("src/app/api/courses/[id]/resources/[resourceId]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"user",role:"teacher"})},"@/lib/course-program-resource":{resourceAccess:async()=>({canManage:manage}),resourceSelect:{}},"@/lib/workspace-drive":{driveName},
  "@/lib/db":{prisma:{courseProgramResource:{findFirst:async()=>exists?item:null}}},
 });
 const req=new NextRequest("http://localhost/api/courses/c/resources/r"),ctx={params:Promise.resolve({id:"c",resourceId:"r"})};
 assert.equal((await route.GET(req,ctx)).status,404);manage=true;
 const response=await route.GET(req,ctx);assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal((await response.json()).resource.name,"renamed.pdf");
 exists=false;assert.equal((await route.GET(req,ctx)).status,404);
});
