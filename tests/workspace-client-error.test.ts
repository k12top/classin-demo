import test from "node:test";
import assert from "node:assert/strict";
import {workspaceRequest} from "../src/lib/workspace-client";
import {retryIdempotentWrite} from "../src/lib/workspace-idempotent-write";

test("workspace requests retain a server error code for actionable recovery",async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:"Translation unavailable",code:"TRANSLATION_NOT_CONFIGURED"}),{status:503,headers:{"Content-Type":"application/json"}});
 try{await assert.rejects(workspaceRequest("/translation",{method:"POST"}),error=>{
  assert.equal((error as {status:number}).status,503);assert.equal((error as {code:string}).code,"TRANSLATION_NOT_CONFIGURED");return true;
 });}finally{globalThis.fetch=original;}
});

test("expired login is distinguished from a temporary refresh failure",async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async input=>String(input)==="/api/auth/refresh"?new Response("",{status:401}):new Response("{}",{status:401});
  await assert.rejects(workspaceRequest("/api/courses"),error=>(error as {status?:number}).status===401);
  globalThis.fetch=async input=>String(input)==="/api/auth/refresh"?new Response("",{status:503}):new Response("{}",{status:401});
  await assert.rejects(workspaceRequest("/api/courses"),error=>(error as {status?:number}).status!==401);
 }finally{globalThis.fetch=original;}
});

test("malformed success cannot confirm a write and an idempotent retry keeps its key",async()=>{
 const original=globalThis.fetch,requests:{key:string|null;body:unknown}[]=[];
 try{
  globalThis.fetch=async(_input,init)=>{requests.push({key:new Headers(init?.headers).get("Idempotency-Key"),body:init?.body});return requests.length===1?new Response("gateway error",{status:200}):Response.json({saved:true});};
  assert.deepEqual(await retryIdempotentWrite("/api/example","POST","request-123",'{"name":"A"}'),{saved:true});
  assert.deepEqual(requests,[{key:"request-123",body:'{"name":"A"}'},{key:"request-123",body:'{"name":"A"}'}]);
  globalThis.fetch=async()=>new Response("denied",{status:403});
  await assert.rejects(workspaceRequest("/api/example"),error=>(error as {status?:number}).status===403);
 }finally{globalThis.fetch=original;}
});
