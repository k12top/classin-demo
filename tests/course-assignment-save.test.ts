import test from "node:test";
import assert from "node:assert/strict";
import {AssignmentSaveUncertainError,createAssignmentDraft,updateAssignmentDraft} from "../src/lib/course-assignment-save";
import type {workspaceRequest} from "../src/lib/workspace-client";

test("lost creation response retries with the exact same id and payload",async()=>{
 const attempts:RequestInit[]=[];
 const request=(async (_path:string,options:RequestInit)=>{attempts.push(options);if(attempts.length===1)throw new TypeError("connection lost");return {draft:{id:"saved"}};}) as typeof workspaceRequest;
 assert.deepEqual(await createAssignmentDraft("/drafts","stable-id",'{"title":"A"}',request),{draft:{id:"saved"}});
 assert.equal(attempts.length,2);assert.equal(attempts[0].body,attempts[1].body);
 assert.equal(new Headers(attempts[0].headers).get("Idempotency-Key"),"stable-id");assert.equal(new Headers(attempts[1].headers).get("Idempotency-Key"),"stable-id");
});

test("lost edit response retries the same version and id",async()=>{
 const attempts:RequestInit[]=[];
 const request=(async (_path:string,options:RequestInit)=>{attempts.push(options);if(attempts.length===1)throw new TypeError("connection lost");return {draft:{id:"saved",version:3}};}) as typeof workspaceRequest;
 assert.deepEqual(await updateAssignmentDraft("/drafts/1","edit-123",'{"version":2}',request),{draft:{id:"saved",version:3}});
 assert.equal(attempts.length,2);assert.equal(attempts[1].method,"PATCH");assert.equal(attempts[0].body,attempts[1].body);assert.equal(new Headers(attempts[1].headers).get("Idempotency-Key"),"edit-123");
});

test("definite validation failure is not retried; repeated transport failure stays uncertain",async()=>{
 let calls=0;
 const rejected=(async()=>{calls++;throw Object.assign(new Error("invalid"),{status:400});}) as typeof workspaceRequest;
 await assert.rejects(createAssignmentDraft("/drafts","id","{}",rejected),/invalid/);assert.equal(calls,1);
 calls=0;const offline=(async()=>{calls++;throw new TypeError("offline");}) as typeof workspaceRequest;
 await assert.rejects(createAssignmentDraft("/drafts","id","{}",offline),AssignmentSaveUncertainError);assert.equal(calls,2);
});
