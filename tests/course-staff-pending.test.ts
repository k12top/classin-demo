import test from "node:test";
import assert from "node:assert/strict";
import {staffPendingKey,parsePendingStaffAssignment,withStaffAssignmentLock,StaffAssignmentBusyError,STAFF_ASSIGNMENT_LIMIT,toggleStaffLesson} from "../src/lib/course-staff-pending";
import {retryIdempotentWrite,UncertainWriteError} from "../src/lib/workspace-idempotent-write";
import type {workspaceRequest} from "../src/lib/workspace-client";

const body=JSON.stringify({staffId:"teacher",role:"assistant",targets:[{id:"lesson",updatedAt:"2028-01-01T00:00:00.000Z"}]});
const raw=JSON.stringify({requestId:"request-123",body});
test("multi-lesson selection respects the API limit and allows deselection",()=>{
 const selected=Array.from({length:STAFF_ASSIGNMENT_LIMIT},(_,index)=>`lesson-${index}`);
 assert.deepEqual(toggleStaffLesson(selected,"extra",true,false),selected);
 assert.equal(toggleStaffLesson(selected,"lesson-0",true,false).length,STAFF_ASSIGNMENT_LIMIT);
 const reduced=toggleStaffLesson(selected,"lesson-0",false,false);
 assert.equal(reduced.length,STAFF_ASSIGNMENT_LIMIT-1);
 assert.ok(toggleStaffLesson(reduced,"extra",true,false).includes("extra"));
 assert.deepEqual(toggleStaffLesson(selected,"extra",true,true),["extra"]);
});
test("pending staff assignments are scoped and validated before recovery",()=>{
 assert.notEqual(staffPendingKey("a","class"),staffPendingKey("b","class"));
 assert.notEqual(staffPendingKey("a","class"),staffPendingKey("a","other"));
 assert.deepEqual(parsePendingStaffAssignment(raw),{requestId:"request-123",body});
 for(const invalid of ["{",JSON.stringify({requestId:"bad",body}),JSON.stringify({requestId:"request-123",body:JSON.stringify({staffId:"teacher",role:"observer",targets:[]})}),JSON.stringify({requestId:"request-123",body:JSON.stringify({staffId:"teacher",role:"assistant",targets:[{id:"lesson",updatedAt:"bad"}]})})])assert.equal(parsePendingStaffAssignment(invalid),null);
});
test("a lost assignment response can be confirmed with its original request",async()=>{
 let calls=0;const receipts=new Map<string,string>();
 const request=(async(_path:string,options:RequestInit)=>{calls++;const key=new Headers(options.headers).get("Idempotency-Key")!;const payload=String(options.body);if(receipts.has(key))assert.equal(receipts.get(key),payload);else receipts.set(key,payload);if(calls<=2)throw new TypeError("response lost");return {updated:true};}) as typeof workspaceRequest;
 await assert.rejects(retryIdempotentWrite("/staff","POST","request-123",body,request),UncertainWriteError);
 const restored=parsePendingStaffAssignment(raw)!;
 assert.deepEqual(await retryIdempotentWrite("/staff","POST",restored.requestId,restored.body,request),{updated:true});
 assert.equal(receipts.size,1);
});
test("another window cannot replace or discard an in-flight assignment",async()=>{
 const held=new Set<string>();
 const locks={request:async(key:string,_options:unknown,callback:(lock:object|null)=>Promise<unknown>)=>{
  if(held.has(key))return callback(null);held.add(key);
  try{return await callback({});}finally{held.delete(key);}
 }} as unknown as LockManager;
 let release!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{started=resolve;});
 const key=staffPendingKey("teacher","class"),first=withStaffAssignmentLock(locks,key,async()=>{started();await gate;return "saved";});
 await entered;
 await assert.rejects(withStaffAssignmentLock(locks,key,async()=>"discard"),StaffAssignmentBusyError);
 assert.equal(await withStaffAssignmentLock(locks,staffPendingKey("teacher","other"),async()=>"other"),"other");
 release();assert.equal(await first,"saved");assert.equal(await withStaffAssignmentLock(locks,key,async()=>"retry"),"retry");
});
