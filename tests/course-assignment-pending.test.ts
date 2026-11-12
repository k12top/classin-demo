import test from "node:test";
import assert from "node:assert/strict";
import {assignmentPendingKey,parsePendingAssignment,withAssignmentPendingLock,AssignmentPendingBusyError,type AssignmentScope} from "../src/lib/course-assignment-pending";
import {AssignmentSaveUncertainError,createAssignmentDraft} from "../src/lib/course-assignment-save";
import type {workspaceRequest} from "../src/lib/workspace-client";

const scope:AssignmentScope={userId:"teacher-a",courseId:"course-a",programId:"program-a",unitId:"unit-a",draftId:null};
const body=JSON.stringify({title:"练习",description:"说明",dueDate:null,programId:scope.programId,unitId:scope.unitId});
const record=JSON.stringify({requestId:"request-123",body});

test("a second window cannot overwrite or discard an in-flight draft",async()=>{
 const held=new Set<string>();
 const locks={request:async(key:string,_options:unknown,callback:(lock:object|null)=>Promise<unknown>)=>{if(held.has(key))return callback(null);held.add(key);try{return await callback({});}finally{held.delete(key);}}} as unknown as LockManager;
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),entered=new Promise<void>(resolve=>{started=resolve;});
 const key=assignmentPendingKey(scope),first=withAssignmentPendingLock(locks,key,async()=>{started();await gate;return "saved";});await entered;
 await assert.rejects(withAssignmentPendingLock(locks,key,async()=>"discard"),AssignmentPendingBusyError);
 assert.equal(await withAssignmentPendingLock(locks,assignmentPendingKey({...scope,courseId:"other"}),async()=>"other"),"other");
 release();assert.equal(await first,"saved");assert.equal(await withAssignmentPendingLock(locks,key,async()=>"retry"),"retry");
});

test("pending records are separated by account, course, program, unit and draft",()=>{
 const key=assignmentPendingKey(scope);
 for(const change of [{userId:"teacher-b"},{courseId:"course-b"},{programId:null},{unitId:null},{draftId:"draft-a"}])assert.notEqual(assignmentPendingKey({...scope,...change}),key);
 assert.deepEqual(parsePendingAssignment(record,scope),{requestId:"request-123",body});
 assert.equal(parsePendingAssignment(record,{...scope,unitId:"other"}),null);
});

test("restore rejects malformed and invalid stored requests",()=>{
 for(const raw of ["{", "x".repeat(12001), JSON.stringify({requestId:"invalid id",body}),JSON.stringify({requestId:"valid-id1",body:JSON.stringify({title:" ",description:"",dueDate:null,programId:scope.programId,unitId:scope.unitId})})])assert.equal(parsePendingAssignment(raw,scope),null);
 const editScope={...scope,draftId:"draft-a"};
 const editBody=JSON.stringify({title:"Updated",description:"",dueDate:null,version:2});
 assert.deepEqual(parsePendingAssignment(JSON.stringify({requestId:"edit-1234",body:editBody}),editScope),{requestId:"edit-1234",body:editBody});
 assert.equal(parsePendingAssignment(JSON.stringify({requestId:"edit-1234",body}),editScope),null);
});

test("an uncertain save can resume the same request after reopening",async()=>{
 let calls=0;const receipts=new Map<string,{draft:{id:string}}>();
 const request=(async(_path:string,options:RequestInit)=>{calls++;const id=new Headers(options.headers).get("Idempotency-Key")!;const result=receipts.get(id)||{draft:{id:"saved"}};receipts.set(id,result);if(calls<=2)throw new TypeError("response lost");return result;}) as typeof workspaceRequest;
 await assert.rejects(createAssignmentDraft("/drafts","request-123",body,request),AssignmentSaveUncertainError);
 const restored=parsePendingAssignment(record,scope)!;
 assert.deepEqual(await createAssignmentDraft("/drafts",restored.requestId,restored.body,request),{draft:{id:"saved"}});
 assert.equal(receipts.size,1);assert.equal(calls,3);
});
