import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import {loadModule} from "./helpers/load-module";

test("attendance respects lesson observer overrides and never falls back from an unknown lesson",async()=>{
 let reads=0;
 const lessons=[{id:"observed",status:"live",startTime:new Date("2026-11-01T00:00:00Z"),endTime:new Date("2026-11-01T01:00:00Z"),endedAt:null},{id:"teaching",status:"scheduled",startTime:new Date("2026-11-02T00:00:00Z"),endTime:new Date("2026-11-02T01:00:00Z"),endedAt:null}];
 const route=loadModule<typeof import("../src/app/api/courses/[id]/attendance/route")>("src/app/api/courses/[id]/attendance/route.ts",{
  "@/lib/session":{getSessionFromRequest:async()=>({userId:"org/teacher",name:"teacher",role:"teacher"})},
  "@/lib/course-teacher":{assertCanTeachCourse:async()=>true,casdoorUserIdCandidates:(id:string)=>[id,id.split("/").at(-1)]},
  "@/lib/course-session-roster":{getEffectiveSessionRoster:async(id:string)=>({observers:id==="observed"?[{userId:"teacher"}]:[]}),rosterHasObserver:(roster:{observers:{userId:string}[]},ids:string[])=>roster.observers.some(item=>ids.includes(item.userId))},
  "@/lib/db":{prisma:{courseSession:{findMany:async()=>lessons},courseAttendance:{findMany:async()=>{reads++;return[];}},courseSessionStudentSubmission:{findMany:async()=>[]}}},
  "@/lib/course-attendance":{closeOpenAttendanceSessionsForLesson:async()=>({})},
  "@/lib/course-session-access":{resolveCourseSessionAccess:async()=>({ok:false})},
 });
 const get=(sessionId:string)=>route.GET(new NextRequest(`http://localhost/api/courses/class/attendance?sessionId=${sessionId}`),{params:Promise.resolve({id:"class"})});
 assert.equal((await get("observed")).status,403);assert.equal(reads,0);
 assert.equal((await get("not-in-class")).status,404);assert.equal(reads,0);
 assert.equal((await get("teaching")).status,200);assert.equal(reads,1);
});
