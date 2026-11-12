import test from "node:test";
import assert from "node:assert/strict";
import {parsePendingSubmission,submissionPendingKey} from "../src/lib/course-assignment-submission-pending";
import {retryIdempotentWrite,UncertainWriteError} from "../src/lib/workspace-idempotent-write";
import type {workspaceRequest} from "../src/lib/workspace-client";

test("submission recovery is scoped and validates the saved version and answer",()=>{
 assert.notEqual(submissionPendingKey("a","c","work"),submissionPendingKey("b","c","work"));
 assert.notEqual(submissionPendingKey("a","c","work"),submissionPendingKey("a","c","other"));
 const valid={requestId:"request-123",content:"Answer",expectedVersion:0};assert.deepEqual(parsePendingSubmission(JSON.stringify(valid)),valid);
 for(const value of [{...valid,content:" "},{...valid,requestId:"x"},{...valid,expectedVersion:-1},{...valid,expectedVersion:0.5},{...valid,content:"x".repeat(10001)}])assert.equal(parsePendingSubmission(JSON.stringify(value)),null);
});
test("lost submission response keeps the original request and version",async()=>{
 const seen:RequestInit[]=[];const request=(async(_path:string,options:RequestInit)=>{seen.push(options);if(seen.length<3)throw new TypeError("offline");return {submission:{version:2}};}) as typeof workspaceRequest;
 const body=JSON.stringify({content:"Answer",expectedVersion:1});await assert.rejects(retryIdempotentWrite("/submit","POST","request-123",body,request),UncertainWriteError);
 assert.deepEqual(await retryIdempotentWrite("/submit","POST","request-123",body,request),{submission:{version:2}});assert.ok(seen.every(call=>call.body===body&&new Headers(call.headers).get("Idempotency-Key")==="request-123"));
});
