import test from "node:test";
import assert from "node:assert/strict";
import {createChatSync} from "../src/lib/workspace-chat-sync";

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

test("slow conversation reads coalesce refreshes and resume after failure",async()=>{
 let calls=0,errors=0,resolveFirst!:()=>void,rejectSecond!:(error:Error)=>void;
 const sync=createChatSync(()=>{
  calls++;
  if(calls===1)return new Promise<void>(resolve=>{resolveFirst=resolve;});
  if(calls===2)return new Promise<void>((_,reject)=>{rejectSecond=reject;});
  return Promise.resolve();
 },()=>true,()=>{errors++;});
 sync.trigger();await flush();sync.trigger();sync.trigger();assert.equal(calls,1);
 resolveFirst();await flush();assert.equal(calls,2);
 sync.trigger();rejectSecond(new Error("offline"));await flush();
 assert.equal(errors,1);assert.equal(calls,3);
 sync.stop();sync.trigger();await flush();assert.equal(calls,3);
});

test("hidden conversations wait for a visible trigger and stopped reads cannot report errors",async()=>{
 let visible=false,calls=0,errors=0,rejectRead!:(error:Error)=>void;
 const sync=createChatSync(()=>{calls++;return new Promise<void>((_,reject)=>{rejectRead=reject;});},()=>visible,()=>{errors++;});
 sync.trigger();await flush();assert.equal(calls,0);
 visible=true;sync.trigger();await flush();sync.trigger();sync.stop();rejectRead(new Error("aborted"));await flush();
 assert.equal(calls,1);assert.equal(errors,0);
});
