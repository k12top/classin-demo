import test from "node:test";
import assert from "node:assert/strict";
import {courseListLessonRoles,scopeListedCourse} from "../src/lib/course-list-visibility";
import {participatesInTeaching,teachingCourse,workspaceStudents,type WorkspaceCourse} from "../src/lib/workspace-model";

test("course list retains only authorized lessons and hides legacy fields when none are visible",async()=>{
 const roles=await courseListLessonRoles(["a","b","c","a"],async ids=>ids.filter(id=>id==="a"||id==="c").map(id=>({id,role:id==="a"?"teacher" as const:"student" as const})));
 const original={sessions:[{id:"a"},{id:"b"},{id:"c"}],recordUrl:"private",roomUuid:"room",startTime:new Date(),endTime:new Date()};
 assert.deepEqual(scopeListedCourse(original,roles).sessions.map(item=>item.id),["a","c"]);
 const empty=scopeListedCourse(original,new Map());assert.deepEqual(empty.sessions,[]);assert.equal(empty.recordUrl,null);assert.equal(empty.roomUuid,null);assert.equal(empty.startTime,null);
});
test("lesson roster lookups are batched and fail closed on errors",async()=>{
 const calls:string[][]=[];const roles=await courseListLessonRoles(Array.from({length:25},(_,i)=>String(i)),async ids=>{calls.push(ids);return ids.map(id=>({id,role:"student" as const}));},7);assert.equal(roles.size,25);assert.deepEqual(calls.map(ids=>ids.length),[7,7,7,4]);
 await assert.rejects(courseListLessonRoles(["allowed","error"],async()=>{throw new Error("database unavailable");}));
});
test("lesson teaching changes presentation without granting class management or directory access",()=>{
 const course:WorkspaceCourse={id:"c",name:"C",teacherName:"Owner",teacherId:"owner",status:"scheduled",startTime:null,endTime:null,roomType:4,canTeach:false,lessonTeaching:true,students:[{studentId:"private",studentName:"Private"}]};
 assert.equal(participatesInTeaching(course,"teacher"),true);assert.equal(teachingCourse(course,"teacher"),false);assert.deepEqual(workspaceStudents([course],[],"teacher"),[]);
});

test("shared viewer resolution preserves lead, assistant and student roles across batches",async()=>{
 const {loadModule}=await import("./helpers/load-module");const calls:string[][]=[];
 const viewer=loadModule<{getViewerSessionRoles(ids:string[],aliases:string[]):Promise<Map<string,string>>}>("src/lib/course-session-viewer.ts",{
  "@/lib/course-list-visibility":{courseListLessonRoles},
  "@/lib/course-session-roster":{getEffectiveSessionRosters:async(ids:string[])=>{calls.push(ids);return ids.map(sessionId=>({sessionId}));},rosterHasObserver:(roster:{sessionId:string},aliases:string[])=>aliases.includes("allowed")&&roster.sessionId==="observer",rosterContainsUser:(roster:{sessionId:string},aliases:string[])=>!aliases.includes("allowed")?null:roster.sessionId==="lead"?{kind:"teacher",member:{role:"teacher"}}:roster.sessionId==="assistant"?{kind:"teacher",member:{role:"assistant"}}:roster.sessionId==="student"?{kind:"student",member:{}}:null},
 });
 const roles=await viewer.getViewerSessionRoles(["lead","assistant","student","observer","hidden"],["allowed"]);assert.deepEqual([...roles],[['lead','teacher'],['assistant','assistant'],['student','student'],['observer','observer']]);assert.equal(calls.length,1);assert.equal((await viewer.getViewerSessionRoles(["lead"],["outsider"])).size,0);
});
