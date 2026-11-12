import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {taskRequestId} from "../src/lib/workspace-task-validation";

type Route={GET(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>;POST(request:NextRequest,context:{params:Promise<{id:string}>}):Promise<Response>};
const path="src/app/api/courses/[id]/sessions/staff/route.ts",when="2028-01-01T00:00:00.000Z";
function fixture(){
 let permitted=true,writes=0,receipt:Record<string,unknown>|null=null,createdRole:unknown;
 const courseSession={findMany:async()=>[{id:"one",courseId:"course",status:"scheduled",endedAt:null,updatedAt:new Date(when),teachers:[]}],updateMany:async()=>{writes++;return {count:1};}};
 const courseStaffGrantReceipt={findUnique:async()=>receipt,create:async({data}:{data:Record<string,unknown>})=>{receipt=data;return data;}};
 const tx={course:{findUnique:async()=>({teacherId:"owner",ownerId:"owner",teachers:[]})},courseSession,classroomMemberState:{findMany:async()=>[]},courseSessionTeacher:{deleteMany:async()=>{},create:async({data}:{data:{role:string}})=>{createdRole=data.role;}},courseStaffGrantReceipt};
 const route=loadModule<Route>(path,{"@/lib/db":{prisma:{courseSession,courseStaffGrantReceipt,$transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}},"@/lib/session":{getSessionFromRequest:async()=>({userId:"owner",name:"owner",role:"teacher"})},"@/lib/course-teacher":{assertCanTeachCourse:async()=>permitted,userCanTeachCourse:()=>true},"@/lib/casdoor-user":{casdoorUserIdsMatch:(a:string,b:string)=>a===b},"@/lib/user-directory":{listDirectoryUsers:async()=>[{id:"staff",name:"Staff",displayName:"Staff",avatar:""}]},"@/lib/course-session-roster":{getEffectiveSessionRosters:async()=>[{courseId:"course",sessionId:"one",leadTeacherId:"owner",teachers:[{userId:"owner",displayName:"Owner",role:"teacher"}]}]},"@/lib/workspace-task-validation":{taskRequestId}});
 const call=(role:string,key="request-123")=>route.POST(new NextRequest("http://localhost/staff",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify({staffId:"staff",role,targets:[{id:"one",updatedAt:when}]})}),{params:Promise.resolve({id:"course"})});
 const list=()=>route.GET(new NextRequest("http://localhost/staff?id=one"),{params:Promise.resolve({id:"course"})});
 return {call,list,setPermitted:(value:boolean)=>{permitted=value;},writes:()=>writes,createdRole:()=>createdRole};
}
test("observer authorization persists the distinct role",async()=>{const f=fixture();assert.equal((await f.call("observer")).status,200);assert.equal(f.createdRole(),"observer");});
test("staff assignments reject unauthorized and unsupported roles",async()=>{
 const f=fixture();assert.equal((await f.call("invalid")).status,400);f.setPermitted(false);assert.equal((await f.call("observer")).status,403);assert.equal(f.writes(),0);
});
test("lesson staff lists require class management permission and return only teaching roles",async()=>{
 const f=fixture();f.setPermitted(false);assert.equal((await f.list()).status,403);f.setPermitted(true);const response=await f.list();assert.equal(response.status,200);assert.deepEqual(await response.json(),{lessons:[{id:"one",leadTeacherId:"owner",teachers:[{id:"owner",name:"Owner",role:"teacher"}],observers:[]}]});
});
test("a repeated staff grant returns its receipt and a changed payload conflicts",async()=>{
 const f=fixture();assert.equal((await f.call("assistant")).status,200);assert.equal((await f.call("assistant")).status,200);assert.equal((await f.call("teacher")).status,409);assert.equal(f.writes(),1);
});
