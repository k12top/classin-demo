import test from "node:test";
import assert from "node:assert/strict";
import {createWorkspaceReadQueue} from "../src/lib/workspace-request-queue";
import {enqueueCourseUnitRead} from "../src/lib/course-unit-read-queue";

test("background reads respect the concurrency limit and discard aborted queued work", async()=>{
 const enqueue=createWorkspaceReadQueue(1), first=new AbortController(), second=new AbortController(), third=new AbortController();
 let release!:()=>void, running=0,max=0; const started:string[]=[];
 const a=enqueue(first.signal,async()=>{started.push("a");max=Math.max(max,++running);await new Promise<void>(resolve=>{release=resolve;});running--;return "a";});
 const b=enqueue(second.signal,async()=>{started.push("b");return "b";});
 const rejected=assert.rejects(b,{name:"AbortError"});
 const c=enqueue(third.signal,async()=>{started.push("c");max=Math.max(max,++running);running--;return "c";});
 await Promise.resolve();second.abort();release();
 assert.equal(await a,"a");await rejected;assert.equal(await c,"c");
 assert.deepEqual(started,["a","c"]);assert.equal(max,1);
});

test("expanded units share four read slots and a collapsed queued unit never starts",async()=>{
 const controllers=Array.from({length:5},()=>new AbortController());
 const release:Array<()=>void>=[];let active=0,max=0,started=0;
 const requests=controllers.map((controller,index)=>enqueueCourseUnitRead(controller.signal,async()=>{
  started++;max=Math.max(max,++active);
  await new Promise<void>(resolve=>{release[index]=resolve;});
  active--;return index;
 }));
 const rejected=assert.rejects(requests[4],{name:"AbortError"});
 await Promise.resolve();assert.equal(started,4);
 controllers[4].abort();release.forEach(resolve=>resolve());
 assert.deepEqual(await Promise.all(requests.slice(0,4)),[0,1,2,3]);await rejected;
 assert.equal(max,4);assert.equal(started,4);
});
