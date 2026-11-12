import assert from "node:assert/strict";
import test from "node:test";
import { prepareScreenInkAccess } from "../src/lib/classroom/screen-ink-access";

test("ink context exchanges a viewer credential in the request body",async()=>{
 const calls:Array<{url:string;init:RequestInit}>=[];
 const request=async (url:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(url),init:init!});return new Response(null,{status:204});};
 const signal=new AbortController().signal;
 await prepareScreenInkAccess({sessionId:"lesson/one",shareAccess:"private-share-token"},signal,request as typeof fetch);
 assert.equal(calls[0].url,"/api/sessions/lesson%2Fone/classroom/screen-ink/context");assert.equal(calls[0].url.includes("private-share-token"),false);
 assert.deepEqual(JSON.parse(String(calls[0].init.body)),{shareAccess:"private-share-token"});assert.equal(calls[0].init.credentials,"same-origin");assert.equal(calls[0].init.signal,signal);
 await prepareScreenInkAccess({sessionId:"lesson",shareAccess:"share",recordingId:"recording",recorderToken:"record-token"},signal,request as typeof fetch);
 assert.deepEqual(JSON.parse(String(calls[1].init.body)),{recordingId:"recording",recorderToken:"record-token"});
 await prepareScreenInkAccess({sessionId:"lesson"},signal,request as typeof fetch);assert.equal(calls.length,2);
});
test("failed context exchange returns a generic error without credentials",async()=>{
 await assert.rejects(prepareScreenInkAccess({sessionId:"lesson",shareAccess:"private-share-token"},new AbortController().signal,async()=>new Response(null,{status:403})),error=>error instanceof Error&&error.message==="SCREEN_INK_CONTEXT_UNAVAILABLE");
});
