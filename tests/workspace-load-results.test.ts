import test from "node:test";
import assert from "node:assert/strict";
import {loadWorkspaceCourses,settleWorkspaceLoads,workspaceAccessDenied} from "../src/lib/workspace-load-results";

test("course reads prefer a later access denial over a temporary failure",async()=>{
 const temporary=Object.assign(new Error("offline"),{status:503});
 const denied=Object.assign(new Error("forbidden"),{status:403});
 await assert.rejects(settleWorkspaceLoads([Promise.reject(temporary),new Promise((_,reject)=>setTimeout(()=>reject(denied),5))]),error=>error===denied);
 await assert.rejects(settleWorkspaceLoads([Promise.reject(temporary)]),error=>error===temporary);
 assert.equal(workspaceAccessDenied(denied),true);
 assert.equal(workspaceAccessDenied(temporary),false);
});

test("queued courses are checked after concurrent failures, with bounded concurrency",async()=>{
 const ids=["a","b","c","denied"],visited:string[]=[];let active=0,peak=0;
 await assert.rejects(loadWorkspaceCourses(ids,new AbortController().signal,async id=>{
  visited.push(id);active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,3));active--;
  throw Object.assign(new Error(id),{status:id==="denied"?403:503});
 }),error=>(error as {status:number}).status===403);
 assert.deepEqual(visited,ids);assert.equal(peak,3);
});

test("access denial immediately cancels slow course reads",async()=>{
 let aborted=false;
 const denied=Object.assign(new Error("forbidden"),{status:403});
 const operation=loadWorkspaceCourses(["slow","denied"],new AbortController().signal,async (id,signal)=>{
  if(id==="denied")throw denied;
  return new Promise((_,reject)=>signal.addEventListener("abort",()=>{aborted=true;reject(signal.reason);},{once:true}));
 });
 await assert.rejects(Promise.race([operation,new Promise((_,reject)=>setTimeout(()=>reject(new Error("timed out")),500))]),error=>error===denied);
 assert.equal(aborted,true);
});
