import test from "node:test";
import assert from "node:assert/strict";
import {getCasdoorRoles,searchCasdoorUsers} from "../src/lib/casdoor-server";

test("strict directory reads bound requests and reject failed or malformed responses",async()=>{
 const previousFetch=globalThis.fetch;
 const names=["NEXT_PUBLIC_CASDOOR_SERVER_URL","NEXT_PUBLIC_CASDOOR_ORG_NAME"] as const;
 const old=names.map(name=>process.env[name]);
 process.env.NEXT_PUBLIC_CASDOOR_SERVER_URL="https://directory.example";
 process.env.NEXT_PUBLIC_CASDOOR_ORG_NAME="fixture";
 try{
  let signals=0;
  globalThis.fetch=async (_input,init)=>{assert.ok(init?.signal instanceof AbortSignal);signals++;return Response.json({status:"ok",data:[]});};
  assert.deepEqual(await getCasdoorRoles({strict:true}),[]);
  assert.deepEqual(await searchCasdoorUsers("",{strict:true}),[]);
  assert.equal(signals,2);
  globalThis.fetch=async()=>Response.json({status:"error"},{status:503});
  await assert.rejects(getCasdoorRoles({strict:true}));await assert.rejects(searchCasdoorUsers("",{strict:true}));
  globalThis.fetch=async()=>Response.json({status:"ok",data:null});
  await assert.rejects(getCasdoorRoles({strict:true}));await assert.rejects(searchCasdoorUsers("",{strict:true}));
  const previousError=console.error;let aborted=false;
  try{
   console.error=()=>{};
   globalThis.fetch=async(_input,init)=>new Promise((_resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Directory did not abort")),1000);
    init!.signal!.addEventListener("abort",()=>{aborted=true;clearTimeout(timer);reject(init!.signal!.reason);},{once:true});
   });
   assert.deepEqual(await searchCasdoorUsers("",{timeoutMs:100}),[]);
   assert.equal(aborted,true,"optional identity enrichment cancels a stalled directory request");
  }finally{console.error=previousError;}
 }finally{
  globalThis.fetch=previousFetch;
  names.forEach((name,index)=>{if(old[index]===undefined)delete process.env[name];else process.env[name]=old[index];});
 }
});
