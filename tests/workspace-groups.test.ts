import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";
import {casdoorUserIdsMatch} from "../src/lib/casdoor-user";
import {taskRequestId} from "../src/lib/workspace-task-validation";

function routeFor(owner:string){
 let write=false;
 const route=loadModule<{POST(request:NextRequest):Promise<Response>}>("src/app/api/groups/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},"@/lib/casdoor-user":{casdoorUserIdsMatch},"@/lib/course-teacher":{assertCourseOwner:async()=>false},"@/lib/casdoor-server":{searchCasdoorUsers:async()=>[]},"@/lib/user-directory":{resolveDirectoryStudents:async()=>[]},"@/lib/group-member-identity":{enrichGroupIdentities:(value:unknown)=>value},"@/lib/workspace-task-validation":{taskRequestId},
  "@/lib/db":{prisma:{studentGroup:{findUnique:async()=>({createdBy:owner}),create:async()=>{write=true;return{id:"created"};}},groupMember:{createMany:async()=>{write=true;return{count:1};},deleteMany:async()=>{write=true;return{count:1};}}}},
 });
 return {route,wrote:()=>write};
}
function request(body:unknown){return new NextRequest("http://localhost/api/groups",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});}
test("creating a nested group cannot attach to another teacher's group",async()=>{
 const {route,wrote}=routeFor("other");const response=await route.POST(request({action:"create",name:"New",parentId:"foreign"}));assert.equal(response.status,403);assert.equal(wrote(),false);
});
test("bulk group mutations reject malformed or excessive member lists",async()=>{
 const {route,wrote}=routeFor("teacher");const invalid=await route.POST(request({action:"addMembers",groupId:"g",members:[{userId:""}]}));const excessive=await route.POST(request({action:"removeMembers",groupId:"g",userIds:Array(201).fill("student")}));assert.equal(invalid.status,400);assert.equal(excessive.status,400);assert.equal(wrote(),false);
});
test("bulk group removal checks ownership before writing",async()=>{
 const {route,wrote}=routeFor("other");const response=await route.POST(request({action:"removeMembers",groupId:"foreign",userIds:["student-a","student-b"]}));assert.equal(response.status,403);assert.equal(wrote(),false);
});
test("listing groups bounds optional directory enrichment and retains stored membership",async()=>{
 const groups=[{id:"group",parentId:null,members:[{userId:"12345678-1234-1234-1234-123456789abc",userName:"Stored student"}],children:[]}];
 let enriched=false;
 const route=loadModule<{GET(request:NextRequest):Promise<Response>}>("src/app/api/groups/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"teacher",role:"teacher"})},
  "@/lib/course-teacher":{assertCourseOwner:async()=>false},
  "@/lib/user-directory":{resolveDirectoryStudents:async()=>[]},
  "@/lib/casdoor-server":{searchCasdoorUsers:async(_query:string,options:{timeoutMs?:number})=>{assert.equal(options.timeoutMs,2000);enriched=true;return[];}},
  "@/lib/group-member-identity":{enrichGroupIdentities:(value:unknown)=>value},
  "@/lib/db":{prisma:{studentGroup:{findMany:async()=>groups}}},
 });
 const response=await route.GET(new NextRequest("http://localhost/api/groups"));
 assert.equal(response.status,200);assert.equal(enriched,true);assert.deepEqual((await response.json()).groups,groups);
});
