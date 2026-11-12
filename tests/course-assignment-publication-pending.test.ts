import test from "node:test";
import assert from "node:assert/strict";
import {parsePendingPublication,publicationPendingKey} from "../src/lib/course-assignment-publication";
import {retryIdempotentWrite,UncertainWriteError} from "../src/lib/workspace-idempotent-write";
import type {workspaceRequest} from "../src/lib/workspace-client";

test("publication recovery is account, course and draft scoped",()=>{
 assert.notEqual(publicationPendingKey("a","c","d"),publicationPendingKey("b","c","d"));
 assert.notEqual(publicationPendingKey("a","c","d"),publicationPendingKey("a","c","e"));
 assert.deepEqual(parsePendingPublication(JSON.stringify({requestId:"request-123",version:2})),{requestId:"request-123",version:2});
 for(const raw of [null,"{",JSON.stringify({requestId:"bad",version:0}),JSON.stringify({requestId:"request-123",version:-1}),JSON.stringify({requestId:"request-123",version:1.5})])assert.equal(parsePendingPublication(raw),null);
});
test("lost publication response is retried using the exact request and version",async()=>{
 const calls:RequestInit[]=[];const request=(async(_path:string,init:RequestInit)=>{calls.push(init);if(calls.length<3)throw new TypeError("lost response");return {assignment:{id:"published"}};}) as typeof workspaceRequest;
 await assert.rejects(retryIdempotentWrite("/publish","POST","request-123",'{"version":2}',request),UncertainWriteError);
 assert.deepEqual(await retryIdempotentWrite("/publish","POST","request-123",'{"version":2}',request),{assignment:{id:"published"}});
 assert.ok(calls.every(call=>call.body==='{"version":2}'&&new Headers(call.headers).get("Idempotency-Key")==="request-123"));
});
