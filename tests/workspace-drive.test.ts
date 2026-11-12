import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {driveFile,driveName,driveParent,drivePublicSelect,driveObjectKey,DRIVE_MAX_BYTES} from "../src/lib/workspace-drive";
import {taskRequestId} from "../src/lib/workspace-task-validation";
import {loadModule} from "./helpers/load-module";
import {isExplicitInstant} from "../src/lib/time-zone";

test("drive rejects traversal, empty files and oversized objects",()=>{
 assert.throws(()=>driveName("../test"));assert.throws(()=>driveName("a\\b"));
 assert.throws(()=>driveFile({name:"x",size:0}));assert.throws(()=>driveFile({name:"x",size:DRIVE_MAX_BYTES+1}));
 assert.deepEqual(driveFile({name:"  notes.pdf ",size:100,contentType:"application/pdf"}),{name:"notes.pdf",parentId:null,size:100,contentType:"application/pdf"});
});
test("drive rejects another account's folder before listing contents",async()=>{
 let listCalled=false,where:unknown;
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>("src/app/api/workspace/drive/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},
  "@/lib/db":{prisma:{workspaceDriveItem:{findFirst:async(args:{where:unknown})=>{where=args.where;return null;},findMany:async()=>{listCalled=true;return[];}}}},
  "@/lib/workspace-drive":{driveName,driveParent,drivePublicSelect},"@/lib/workspace-task-validation":{taskRequestId},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/drive?parentId=foreign"));
 assert.equal(response.status,404);assert.deepEqual(where,{id:"foreign",userId:"a",kind:"folder",status:"ready"});assert.equal(listCalled,false);
});
test("uploaded objects are not published until storage confirms expected size",async()=>{
 let published=false;
 const route=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/complete/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},
  "@/lib/db":{prisma:{workspaceDriveItem:{findFirst:async()=>({objectKey:"opaque",size:100,status:"pending"}),updateMany:async()=>{published=true;}}}},
  "@/lib/aliyun-oss":{getAliyunOssClient:()=>({head:async()=>({res:{headers:{"content-length":"99"}}})})},
  "@/lib/workspace-drive":{drivePublicSelect},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/drive/item/complete",{method:"POST"}),{params:Promise.resolve({id:"item"})});
 assert.equal(response.status,409);assert.equal(published,false);
});
test("an upload already moved to trash cannot be published",async()=>{
 let storage=false;
 const route=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/complete/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{workspaceDriveItem:{findFirst:async()=>({objectKey:"opaque",status:"trashed-pending"})}}},
  "@/lib/aliyun-oss":{getAliyunOssClient:()=>({head:async()=>{storage=true;}})},"@/lib/workspace-drive":{drivePublicSelect},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/drive/item/complete",{method:"POST"}),{params:Promise.resolve({id:"item"})});assert.equal(response.status,409);assert.equal(storage,false);
});
test("download never accesses storage for another account's file",async()=>{
 let storage=false,where:unknown;
 const route=loadModule<{GET(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/file/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},
  "@/lib/db":{prisma:{workspaceDriveItem:{findFirst:async(args:{where:unknown})=>{where=args.where;return null;}}}},
  "@/lib/courseware-file-response":{coursewareFileResponse:async()=>{storage=true;return new Response();}},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/drive/item/file"),{params:Promise.resolve({id:"item"})});
 assert.equal(response.status,404);assert.deepEqual(where,{id:"item",userId:"a",kind:"file",status:"ready"});assert.equal(storage,false);
});
test("recent file cursors must belong to the authenticated account",async()=>{
 let listed=false;
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>("src/app/api/workspace/drive/recent/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{workspaceDriveItem:{findFirst:async({where}:{where:{userId:string}})=>{assert.equal(where.userId,"a");return null;},findMany:async()=>{listed=true;return[];}}}},"@/lib/workspace-drive":{drivePublicSelect},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/drive/recent?cursor=foreign"));assert.equal(response.status,400);assert.equal(listed,false);
});
test("recent history failure never interrupts an authorized download",async()=>{
 const route=loadModule<{GET(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/file/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{workspaceDriveItem:{findFirst:async()=>({name:"notes.txt",objectKey:"key"})},$executeRaw:async()=>{throw Error("offline");}}},"@/lib/courseware-file-response":{coursewareFileResponse:async()=>new Response("file bytes")},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/workspace/drive/item/file"),{params:Promise.resolve({id:"item"})});assert.equal(response.status,200);assert.equal(await response.text(),"file bytes");
});
test("opening another user's file does not create recent history",async()=>{
 let values:unknown[]=[];
 const route=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/opened/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{$queryRaw:async(_:TemplateStringsArray,...args:unknown[])=>{values=args;return[];}}},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/drive/foreign/opened",{method:"POST"}),{params:Promise.resolve({id:"foreign"})});assert.equal(response.status,404);assert.deepEqual(values,["foreign","a"]);
});
test("storage upload policy bounds object size before the upload is accepted",async()=>{
 let policy:unknown;
 const route=loadModule<{POST(request:NextRequest):Promise<Response>}>("src/app/api/workspace/drive/upload/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},
  "@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({workspaceDriveItem:{upsert:async()=>({id:"item",kind:"file",name:"notes.pdf",parentId:null,size:100,contentType:"application/pdf",status:"pending",objectKey:"opaque"})}})}},
  "@/lib/aliyun-oss":{getAliyunOssClient:()=>({signatureUrl:()=>"https://example.invalid/opaque?signature=hidden",calculatePostSignature:(value:unknown)=>{policy=value;return {policy:"signed",Signature:"signature",OSSAccessKeyId:"id"};}})},
  "@/lib/workspace-drive":{driveFile,driveObjectKey},"@/lib/workspace-task-validation":{taskRequestId},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/drive/upload",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"request-123"},body:JSON.stringify({name:"notes.pdf",size:100,contentType:"application/pdf"})}));
 assert.equal(response.status,200);assert.ok((policy as {conditions:unknown[]}).conditions.some(value=>Array.isArray(value)&&value[0]==="content-length-range"&&value[1]===100&&value[2]===100));
});
test("a trashed upload cannot receive a new storage policy on retry",async()=>{
 let signed=false;
 const route=loadModule<{POST(request:NextRequest):Promise<Response>}>("src/app/api/workspace/drive/upload/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},
  "@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn({workspaceDriveItem:{upsert:async()=>({id:"item",kind:"file",name:"notes.pdf",parentId:null,size:100,contentType:"application/pdf",status:"trashed",objectKey:"opaque"})}})}},
  "@/lib/aliyun-oss":{getAliyunOssClient:()=>({signatureUrl:()=>{signed=true;return "https://example.invalid";}})},"@/lib/workspace-drive":{driveFile,driveObjectKey},"@/lib/workspace-task-validation":{taskRequestId},
 });
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/drive/upload",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":"request-123"},body:JSON.stringify({name:"notes.pdf",size:100,contentType:"application/pdf"})}));assert.equal(response.status,409);assert.equal(signed,false);
});
test("trash rejects a stale file version before touching the subtree",async()=>{
 let wrote=false;
 const tx={workspaceDriveItem:{findFirst:async({where}:{where:unknown})=>{assert.deepEqual(where,{id:"item",userId:"a"});return{id:"item",status:"ready",trashRootId:null,updatedAt:new Date("2026-11-09T12:00:00Z")};}},$executeRaw:async()=>{wrote=true;}};
 const route=loadModule<{DELETE(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/route.ts",{"@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}},"@/lib/workspace-drive":{driveName,drivePublicSelect},"@/lib/time-zone":{isExplicitInstant}});
 const response=await route.DELETE(new NextRequest("http://localhost/api/workspace/drive/item",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({updatedAt:"2026-11-08T12:00:00Z"})}),{params:Promise.resolve({id:"item"})});assert.equal(response.status,409);assert.equal(wrote,false);
});
test("trash restore cannot change another account's item",async()=>{
 let wrote=false;
 const tx={workspaceDriveItem:{findFirst:async({where}:{where:unknown})=>{assert.deepEqual(where,{id:"foreign",userId:"a"});return null;}},$executeRaw:async()=>{wrote=true;}};
 const route=loadModule<{POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/restore/route.ts",{"@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}},"@/lib/time-zone":{isExplicitInstant}});
 const response=await route.POST(new NextRequest("http://localhost/api/workspace/drive/foreign/restore",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({updatedAt:"2026-11-08T12:00:00Z"})}),{params:Promise.resolve({id:"foreign"})});assert.equal(response.status,404);assert.equal(wrote,false);
});
test("rename is account scoped and does not overwrite a newer edit",async()=>{
 let where:unknown;
 const route=loadModule<{PATCH(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{workspaceDriveItem:{updateMany:async(args:{where:unknown})=>{where=args.where;return{count:0};},findFirst:async()=>({name:"changed"})}}},
  "@/lib/workspace-drive":{driveName,drivePublicSelect},"@/lib/time-zone":{isExplicitInstant},
 });
 const response=await route.PATCH(new NextRequest("http://localhost/api/workspace/drive/item",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"new",updatedAt:"2026-11-08T12:00:00.000Z",userId:"b"})}),{params:Promise.resolve({id:"item"})});
 assert.equal(response.status,409);assert.deepEqual(where,{id:"item",userId:"a",status:"ready",updatedAt:new Date("2026-11-08T12:00:00.000Z")});
});
test("moving a folder into its descendant is rejected without writing",async()=>{
 let wrote=false;
 const item={id:"source",userId:"a",parentId:null,updatedAt:new Date("2026-11-08T12:00:00.000Z")};
 const tx={workspaceDriveItem:{findFirst:async({where}:{where:{id:string;userId:string}})=>{assert.equal(where.userId,"a");return where.id==="source"?item:where.id==="child"?{parentId:"source"}:null;},updateMany:async()=>{wrote=true;return{count:1};}}};
 const route=loadModule<{PATCH(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/move/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>unknown,options:unknown)=>{assert.deepEqual(options,{isolationLevel:"Serializable"});return fn(tx);}}},"@/lib/workspace-drive":{driveParent,drivePublicSelect},"@/lib/time-zone":{isExplicitInstant},
 });
 const response=await route.PATCH(new NextRequest("http://localhost/api/workspace/drive/source/move",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({parentId:"child",updatedAt:item.updatedAt.toISOString()})}),{params:Promise.resolve({id:"source"})});
 assert.equal(response.status,400);assert.equal(wrote,false);
});
test("moving to a folder owned by another account does not write",async()=>{
 let wrote=false;
 const item={id:"source",parentId:null,updatedAt:new Date("2026-11-08T12:00:00.000Z")};
 const tx={workspaceDriveItem:{findFirst:async({where}:{where:{id:string;userId:string}})=>{assert.equal(where.userId,"a");return where.id==="source"?item:null;},updateMany:async()=>{wrote=true;return{count:1};}}};
 const route=loadModule<{PATCH(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/move/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}},"@/lib/workspace-drive":{driveParent,drivePublicSelect},"@/lib/time-zone":{isExplicitInstant},
 });
 const response=await route.PATCH(new NextRequest("http://localhost/api/workspace/drive/source/move",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({parentId:"foreign",updatedAt:item.updatedAt.toISOString()})}),{params:Promise.resolve({id:"source"})});
 assert.equal(response.status,404);assert.equal(wrote,false);
});
test("moving a file checks owner and version and updates its parent",async()=>{
 let update:unknown;
 const item={id:"source",parentId:null,updatedAt:new Date("2026-11-08T12:00:00.000Z")};
 const tx={workspaceDriveItem:{findFirst:async({where}:{where:{id:string;userId:string}})=>{assert.equal(where.userId,"a");return where.id==="source"?item:where.id==="folder"?{parentId:null}:null;},updateMany:async(args:unknown)=>{update=args;return{count:1};}}};
 const route=loadModule<{PATCH(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/workspace/drive/[id]/move/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"a"})},"@/lib/db":{prisma:{$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}},"@/lib/workspace-drive":{driveParent,drivePublicSelect},"@/lib/time-zone":{isExplicitInstant},
 });
 const response=await route.PATCH(new NextRequest("http://localhost/api/workspace/drive/source/move",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({parentId:"folder",updatedAt:item.updatedAt.toISOString()})}),{params:Promise.resolve({id:"source"})});
 assert.equal(response.status,200);assert.deepEqual(update,{where:{id:"source",userId:"a",status:"ready",updatedAt:item.updatedAt},data:{parentId:"folder"}});
});
