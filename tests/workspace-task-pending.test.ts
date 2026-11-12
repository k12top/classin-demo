import test from "node:test";
import assert from "node:assert/strict";
import {parsePendingTask,pendingTaskKey} from "../src/lib/workspace-task-pending";
import {retryIdempotentWrite,UncertainWriteError} from "../src/lib/workspace-idempotent-write";
import type {workspaceRequest} from "../src/lib/workspace-client";

const body=JSON.stringify({title:"准备练习",notes:"说明",dueDate:"2028-02-29",courseId:"course-1",sessionId:"lesson-1"});
const record=JSON.stringify({requestId:"task-request-1",body});
test("pending tasks are scoped by account and invalid local records are rejected",()=>{
 assert.notEqual(pendingTaskKey("teacher-a"),pendingTaskKey("teacher-b"));
 assert.notEqual(pendingTaskKey('a"b'),pendingTaskKey("a"));
 assert.equal(parsePendingTask(record)?.body,body);
 for(const invalid of ["{","x".repeat(20001),JSON.stringify({requestId:"bad id",body}),JSON.stringify({requestId:"valid-id1",body:JSON.stringify({title:" ",notes:""})}),JSON.stringify({requestId:"valid-id1",body:JSON.stringify({title:"x",sessionId:"lesson"})})])assert.equal(parsePendingTask(invalid),null);
});
test("a reopened form can confirm an uncertain creation with the original request",async()=>{
 let attempts=0;const saved=new Map<string,{task:{id:string}}>();
 const request=(async(_path:string,options:RequestInit)=>{const id=new Headers(options.headers).get("Idempotency-Key")!;const item=saved.get(id)||{task:{id:"one"}};saved.set(id,item);if(++attempts<=2)throw new TypeError("response lost");assert.equal(options.body,body);return item;}) as typeof workspaceRequest;
 await assert.rejects(retryIdempotentWrite("/tasks","POST","task-request-1",body,request),UncertainWriteError);
 const restored=parsePendingTask(record)!;
 assert.deepEqual(await retryIdempotentWrite("/tasks","POST",restored.requestId,restored.body,request),{task:{id:"one"}});assert.equal(saved.size,1);
});
