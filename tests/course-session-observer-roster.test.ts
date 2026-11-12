import test from "node:test";
import assert from "node:assert/strict";
import {loadModule} from "./helpers/load-module";

const record=(id:string,role:string)=>({teacherId:id,teacherName:id,teacherAvatar:"",action:"include",role});
function fixture(rules:ReturnType<typeof record>[],teachers=[{teacherId:"lead",teacherName:"Lead",teacherAvatar:""}]){
 const session={id:"lesson",courseId:"class",teacherMode:"inherit",studentMode:"inherit",leadTeacherId:"lead",teachers:rules,students:[],groupLinks:[],course:{teacherId:"lead",teacherName:"Lead",teacherAvatar:"",teachers,students:[{studentId:"viewer",studentName:"Viewer",studentAvatar:""}],groupLinks:[]}};
 return loadModule<typeof import("../src/lib/course-session-roster")>("src/lib/course-session-roster.ts",{"@/lib/db":{prisma:{courseSession:{findUnique:async()=>session}}},"@/lib/course-teacher":{casdoorUserIdCandidates:(id:string)=>[id,id.split("/").at(-1)]},"@/lib/course-status":{getFinishedDelayMinutes:()=>30}});
}
test("observer rules are distinct from teachers and fail closed for inherited student access",async()=>{
 const service=fixture([record("org/viewer","observer")]);const roster=(await service.getEffectiveSessionRoster("lesson"))!;
 assert.equal(roster.observers.length,1);assert.equal(roster.observers[0].userId,"org/viewer");assert.equal(roster.teachers.some(item=>item.userId==="org/viewer"),false);assert.equal(roster.students.some(item=>item.userId==="viewer"),false);
 assert.equal(service.rosterContainsUser(roster,["viewer"]),null);assert.equal(service.rosterContainsUser(roster,["lead"])?.kind,"teacher");
 assert.equal(service.rosterHasObserver(roster,["viewer"]),true);assert.equal(service.rosterHasObserver(roster,["lead"]),false);
});
test("an observer cannot fall back to a share link or open public class",async()=>{
 let shareCalls=0,publicLookups=0;
 const rosterService=fixture([record("org/viewer","observer")]);const roster=(await rosterService.getEffectiveSessionRoster("lesson"))!;
 const lesson={id:"lesson",courseId:"class",status:"live",startTime:new Date(Date.now()-60_000),endTime:new Date(Date.now()+60_000),endedAt:null,roomType:10,roomUuid:"room",title:"Class"};
 const access=loadModule<typeof import("../src/lib/course-session-access")>("src/lib/course-session-access.ts",{
  "@/lib/db":{prisma:{classroomMemberState:{findFirst:async()=>null},course:{findUnique:async()=>{publicLookups++;return {passcode:""};}}}},
  "@/lib/course-status":{canEnterClassroom:()=>true,CourseStatus:{SCHEDULED:"scheduled",LIVE:"live",AFTER_CLASS:"afterClass",FINISHED:"finished",CANCELLED:"cancelled"},getEarlyClassroomEntryMinutes:()=>0,getFinishedDelayMinutes:()=>30,isTooEarlyToEnterClassroom:()=>false},
  "@/lib/course-teacher":{casdoorUserIdCandidates:(id:string)=>[id,id.split("/").at(-1)]},
  "@/lib/course-session-roster":{resolveCourseSessionReference:async()=>lesson,getEffectiveSessionRoster:async()=>roster,getCourseSessionWithRoster:async()=>({session:lesson,roster}),rosterContainsUser:rosterService.rosterContainsUser,rosterHasObserver:rosterService.rosterHasObserver},
  "@/lib/join-link":{verifyShareAccessToken:async()=>{shareCalls++;return {ok:true};}},
 });
 const result=await access.resolveCourseSessionAccess("lesson","viewer",{referenceType:"session",shareAccessToken:"valid"});
 assert.equal(result.ok,true);if(result.ok)assert.equal(result.role,"observer");assert.equal(shareCalls,0);assert.equal(publicLookups,0);
 const review=await access.resolveCourseSessionAccess("lesson","viewer",{referenceType:"session",purpose:"activities"});
 assert.equal(review.ok,true);if(review.ok){assert.equal(review.role,"observer");assert.equal(review.sessionId,"lesson");}
});
test("observer aliases cannot fall through to an inherited teaching role",async()=>{
 const service=fixture([record("viewer","observer")],[{teacherId:"lead",teacherName:"Lead",teacherAvatar:""},{teacherId:"uuid-viewer",teacherName:"Viewer",teacherAvatar:""}]);const roster=(await service.getEffectiveSessionRoster("lesson"))!;
 assert.equal(service.rosterContainsUser(roster,["uuid-viewer","viewer"]),null);
});
test("unknown staff roles do not silently become assistants",async()=>{
 const service=fixture([record("stranger","invalid")]);const roster=(await service.getEffectiveSessionRoster("lesson"))!;
 assert.equal(roster.teachers.some(item=>item.userId==="stranger"),false);assert.equal(service.rosterContainsUser(roster,["stranger"]),null);
});
test("locked observer lookup matches effective roster overrides and aliases",async()=>{
 for(const rules of [
  [record("org/VIEWER","observer")],
  [record("org/viewer","observer"),record("viewer","assistant")],
  [record("org/viewer","assistant"),record("viewer","observer")],
  [record("org/viewer","observer"),{...record("viewer","observer"),action:"exclude"}],
 ]){
  const service=fixture(rules);const roster=(await service.getEffectiveSessionRoster("lesson"))!;
  assert.equal(await service.getSessionObserverStatus("lesson",["viewer"]),service.rosterHasObserver(roster,["viewer"]));
 }
 const service=fixture([]);
 assert.equal(await service.getSessionObserverStatus("missing",["viewer"],{courseSession:{findUnique:async()=>null}} as never),null);
});
