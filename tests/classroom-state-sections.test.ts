import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { loadModule } from "./helpers/load-module";
const { classroomCaptionDelta } = loadModule<typeof import("../src/lib/classroom/server/caption-delta")>("src/lib/classroom/server/caption-delta.ts", { "server-only": {} });
function fixture(allowed=true) {
 const calls:{role:string;refresh:boolean}[]=[];let conversionStarted=false;
 const api=loadModule<typeof import("../src/app/api/courses/[id]/classroom/state/route")>("src/app/api/courses/[id]/classroom/state/route.ts",{
 "@/lib/classroom/server/redis":{classroomRedisEnabled:()=>false,classroomRedisCommand:async()=>undefined},"@/lib/classroom/server/redis-sync":{requestClassroomRedisRefresh:async()=>false}, "next/server":{NextResponse},"@/lib/classroom/server/runtime":{getClassroomRuntimeSnapshot:async()=>({revision:3,status:"live"}),getClassroomEngagementSnapshot:async()=>({}),getClassroomCourseware:async(_course:string,role:string,_session:string,refresh=false)=>{calls.push({role,refresh});if(refresh)conversionStarted=true;return [{id:"allowed-document"}];}},
 "@/lib/classroom/server/request-access":{resolveClassroomRequestAccess:async()=>allowed?{ok:true,access:{courseId:"course",sessionId:"session",role:"student"},session:{userId:"student"}}:{ok:false,error:"Forbidden",code:"forbidden",status:403}},
 "@/lib/classroom/server/caption-delta": { classroomCaptionDelta },"@/lib/classroom/server/captions":{getClassroomCaptions:async()=>[{id:"caption"}]},"@/lib/classroom/server/questions":{getClassroomQuestions:async()=>[]},"@/lib/classroom/server/spaces":{getClassroomSpaces:async()=>[]},"@/lib/classroom/mode":{classroomModePolicy:()=>({allowBreakouts:false,showPublicQuestions:false})},"@/lib/classroom/server/provider-factory":{getRecordingProvider:()=>({isConfigured:()=>false})},"@/lib/classroom/server/shared-cache":{classroomSharedRead:async(_id:string,_key:string,read:()=>unknown)=>read()},"@/lib/database-response":{databaseUnavailableResponse:()=>null},"@/lib/db":{prisma:{courseSession:{findUnique:async()=>({roomType:4,course:{autoStudentOnStage:false},recordings:[]})}}},
 });
 const get=(scope="", cursor="")=>api.GET(new NextRequest(`https://mock.test/api/sessions/session/classroom/state${scope?`?scope=${scope}`:""}${cursor?`${scope?"&":"?"}captionCursor=${cursor}`:""}`),{params:Promise.resolve({id:"session"})});
 return {get,calls,get conversionStarted(){return conversionStarted;}};
}
test("snapshot does not request remote conversion; scoped conversion preserves authorized role",async()=>{
 const f=fixture();const full=await f.get();assert.equal(full.status,200);assert.equal(f.conversionStarted,false);assert.deepEqual(f.calls,[{role:"student",refresh:false}]);
 const section=await f.get("courseware");assert.equal(section.status,200);assert.equal(f.conversionStarted,true);assert.deepEqual(Object.keys(await section.json()),["courseware"]);assert.equal(f.calls.at(-1)?.role,"student");
});
test("caption notification fetches only authorized captions without other snapshot fan-out",async()=>{
 const f=fixture();const response=await f.get("captions");const body = await response.json();assert.deepEqual(body.captions,[{id:"caption"}]);assert.equal(body.captionSync.mode,"snapshot");assert.ok(body.captionSync.cursor);assert.equal(f.calls.length,0);assert.equal(f.conversionStarted,false);
});
test("every scoped read rejects unauthorized viewers before any content reads",async()=>{
 for(const scope of ["captions","courseware","runtime"]){const f=fixture(false);const response=await f.get(scope);assert.equal(response.status,403);assert.equal(f.calls.length,0);}
});


test("caption and full-state polls share a cursor and omit unchanged caption history", async () => {
 const f=fixture();const initial=await (await f.get("captions")).json();
 const delta=await (await f.get("captions",initial.captionSync.cursor)).json();
 assert.deepEqual(delta,{captions:[],captionSync:{mode:"delta"}});
 const full=await (await f.get("",initial.captionSync.cursor)).json();
 assert.deepEqual(full.captions,[]);assert.equal(full.captionSync.mode,"delta");assert.ok(full.runtime);
 const denied=await fixture(false).get("captions",initial.captionSync.cursor);assert.equal(denied.status,403);
});
