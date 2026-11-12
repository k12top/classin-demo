import test from "node:test";
import assert from "node:assert/strict";
import {loadWorkspaceStudentAssignments} from "../src/lib/workspace-student-assignments";
import {courseWorkspacePath} from "../src/lib/course-schedule";
import type {workspaceRequest} from "../src/lib/workspace-client";

test("student assignments load every page without duplicating courses",async()=>{
 const calls:string[]=[];
 const request=(async(path:string)=>{calls.push(path);return path.includes("cursor=")?{tasks:[{id:"second",title:"B",programId:null,unitId:null,dueDate:null}],nextCursor:null}:{tasks:[{id:"first/1",title:"A",programId:null,unitId:null,dueDate:null}],nextCursor:"first/1"};}) as typeof workspaceRequest;
 const items=await loadWorkspaceStudentAssignments(["class a","class a"],new AbortController().signal,request);
 assert.equal(calls.length,2);assert.deepEqual(items.map(item=>item.id),["first/1","second"]);
 assert.equal(courseWorkspacePath(items[0].courseId,null,null,null,null,items[0].id),"/courses/class%20a?assignmentId=first%2F1");
});

test("partial student assignment reads are not presented as complete",async()=>{
 const request=(async(path:string)=>{if(path.includes("bad"))throw new Error("offline");return {tasks:[],nextCursor:null};}) as typeof workspaceRequest;
 await assert.rejects(loadWorkspaceStudentAssignments(["good","bad"],new AbortController().signal,request));
});
