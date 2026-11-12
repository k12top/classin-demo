import test from "node:test";
import assert from "node:assert/strict";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";

test("session list only returns roster roles for visible lessons",async()=>{
 let identity="lead";
 const rows=[{id:"assigned",studentSubmissions:[],_count:{recordings:1}},{id:"other",studentSubmissions:[],_count:{recordings:0}}];
 const route=loadModule<{GET(r:NextRequest,c:{params:Promise<{id:string}>}):Promise<Response>}>("src/app/api/courses/[id]/sessions/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:identity,name:identity,role:identity==="student"?"student":"teacher"})},
  "@/lib/db":{prisma:{courseSession:{findMany:async()=>rows}}},
  "@/lib/course-teacher":{assertCanTeachCourse:async()=>false,casdoorUserIdCandidates:(id:string)=>[id]},
  "@/lib/course-session-service":{serializeCourseSession:(item:{id:string})=>({id:item.id})},
  "@/lib/course-session-viewer":{getViewerSessionRoles:async(_ids:string[],aliases:string[])=>{const role=aliases.includes("lead")?"teacher":aliases.includes("assistant")?"assistant":aliases.includes("student")?"student":aliases.includes("observer")?"observer":null;return new Map(role?[["assigned",role]]:[]);}},
  "@/lib/casdoor-user":{casdoorUserIdsMatch:(a:string,b:string)=>a===b},"@/lib/course-session-submission":{serializeStudentSubmission:()=>null},"@/lib/course-session-status":{},"@/lib/workspace-task-validation":{},
 });
 const get=async()=>{const response=await route.GET(new NextRequest("http://localhost/api/courses/c/sessions"),{params:Promise.resolve({id:"c"})});assert.equal(response.status,200);return response.json();};
 for(const [user,role] of [["lead","teacher"],["assistant","assistant"],["student","student"],["observer","observer"]]){identity=user;const result=await get();assert.equal(result.canManage,false);assert.deepEqual(result.sessions.map((item:{id:string;viewerRole:string})=>[item.id,item.viewerRole]),[["assigned",role]]);if(role==="observer"){assert.deepEqual(result.sessions[0].students,[]);assert.deepEqual(result.sessions[0].teachers,[]);assert.equal(result.sessions[0].mySubmission,null);}}
 identity="outsider";assert.deepEqual((await get()).sessions,[]);
});
