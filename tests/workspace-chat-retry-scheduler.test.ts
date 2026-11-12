import test from "node:test";
import assert from "node:assert/strict";
import {createChatRetryScheduler} from "../src/lib/workspace-chat-retry-scheduler";

test("temporary failures retry with a bounded per-message backoff",()=>{
 const pending=new Map<number,{run:()=>void;delay:number}>();let next=0;const retried:string[]=[];
 const clock={set:(run:()=>void,delay:number)=>{const id=++next;pending.set(id,{run,delay});return id as unknown as ReturnType<typeof setTimeout>;},clear:(id:ReturnType<typeof setTimeout>)=>{pending.delete(id as unknown as number);}};
 const scheduler=createChatRetryScheduler(target=>retried.push(target.clientId),clock),a={storageKey:"user",conversation:"a",clientId:"one"},b={...a,clientId:"two"};
 const fire=(id:number)=>{const entry=pending.get(id)!;pending.delete(id);entry.run();};
 assert.equal(scheduler.schedule(a,{status:503},true),true);assert.equal(pending.get(1)?.delay,1000);
 assert.equal(scheduler.schedule(a,{status:503},true),false);assert.equal(scheduler.schedule(b,{status:403},true),false);assert.equal(scheduler.schedule(b,new Error("offline"),false),false);
 assert.equal(scheduler.schedule(b,new Error("timeout"),true),true);fire(1);fire(2);assert.deepEqual(retried,["one","two"]);
 assert.equal(scheduler.schedule(a,{status:429},true),true);assert.equal(pending.get(3)?.delay,3000);fire(3);
 assert.equal(scheduler.schedule(a,new Error("timeout"),true),true);assert.equal(pending.get(4)?.delay,7000);fire(4);
 assert.equal(scheduler.schedule(a,new Error("timeout"),true),false);
 scheduler.cancel(a,true);assert.equal(scheduler.schedule(a,new Error("timeout"),true),true);scheduler.clear();assert.equal(pending.size,0);
});
