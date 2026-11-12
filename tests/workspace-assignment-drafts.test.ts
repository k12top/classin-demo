import test from "node:test";
import assert from "node:assert/strict";
import {loadWorkspaceAssignmentDrafts} from "../src/lib/workspace-assignment-drafts";
import type {workspaceRequest} from "../src/lib/workspace-client";

test("draft feed reads every course and page without mixing course ownership",async()=>{
 const calls:string[]=[];
 const request=(async(path:string)=>{calls.push(path);const url=new URL(path,"http://localhost"),course=decodeURIComponent(url.pathname.split("/")[3]),cursor=url.searchParams.get("cursor");
  return {drafts:[{id:`${course}-${cursor||"first"}`,programId:cursor?"program":null,unitId:null,title:"Draft",description:"",dueDate:null}],nextCursor:course==="a"&&!cursor?"next":null};
 }) as typeof workspaceRequest;
 const items=await loadWorkspaceAssignmentDrafts(["a","b","a"],new AbortController().signal,request);
 assert.deepEqual(items.map(item=>[item.courseId,item.id]),[["a","a-first"],["a","a-next"],["b","b-first"]]);
 assert.equal(calls.length,3);assert.ok(calls.every(path=>new URL(path,"http://localhost").searchParams.get("allPrograms")==="1"));
});

test("a failed or repeating page does not return an incomplete draft feed",async()=>{
 const request=(async()=>({drafts:[],nextCursor:"same"})) as typeof workspaceRequest;
 await assert.rejects(loadWorkspaceAssignmentDrafts(["a"],new AbortController().signal,request),/Repeated assignment cursor/);
 const failure=(async()=>{throw new Error("offline");}) as typeof workspaceRequest;
 await assert.rejects(loadWorkspaceAssignmentDrafts(["a","b"],new AbortController().signal,failure),/offline/);
});
