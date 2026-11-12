import test from "node:test";
import assert from "node:assert/strict";
import {loadWorkspaceReviewTasks} from "../src/lib/workspace-assignment-reviews";
import {courseWorkspacePath} from "../src/lib/course-schedule";
import type {workspaceRequest} from "../src/lib/workspace-client";
import {loadModule} from "./helpers/load-module";

test("review tasks are scoped to distinct classes and retain a safe direct link",async()=>{
 const calls:string[]=[];
 const request=(async(path:string)=>{calls.push(path);return {tasks:[{id:"work/1",programId:null,unitId:null,title:"Work",dueDate:null,pendingCount:2}]};}) as typeof workspaceRequest;
 const tasks=await loadWorkspaceReviewTasks(["class a","class a","class b"],new AbortController().signal,request);
 assert.equal(calls.length,2);assert.deepEqual(tasks.map(task=>task.courseId),["class a","class b"]);
 assert.equal(courseWorkspacePath(tasks[0].courseId,null,null,null,tasks[0].id),"/courses/class%20a?reviewId=work%2F1");
});

test("a failed class read does not present a partial review list as complete",async()=>{
 const request=(async(path:string)=>{if(path.includes("bad"))throw new Error("offline");return {tasks:[]};}) as typeof workspaceRequest;
 await assert.rejects(loadWorkspaceReviewTasks(["good","bad"],new AbortController().signal,request));
});

test("teacher-only review rejects students without loading lesson rosters",async()=>{
 const access=loadModule<{assignmentSubmissionAccess:(tx:unknown,user:unknown,courseId:string,programId:null,options:unknown)=>Promise<unknown>}>("src/lib/course-assignment-submissions.ts",{
  "server-only":{},
  "@/lib/course-teacher":{casdoorUserIdCandidates:(id:string)=>[id],userCanTeachCourse:()=>false},
  "@/lib/course-session-roster":{getEffectiveSessionRosters:()=>{throw new Error("unexpected roster read");},getEffectiveSessionRostersSequential:()=>{throw new Error("unexpected roster read");}},
 });
 const tx={course:{findUnique:async()=>({teachers:[]})},courseSession:{findMany:()=>{throw new Error("unexpected lesson read");}}};
 assert.deepEqual(await access.assignmentSubmissionAccess(tx,{userId:"student",name:"student",role:"student"},"course",null,{teacherOnly:true}),{teacher:false,student:false});
});
