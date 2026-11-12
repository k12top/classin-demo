import test from "node:test";
import assert from "node:assert/strict";
import {createWorkspaceGroupLoader} from "../src/lib/workspace-group-loader";
import type {workspaceRequest} from "../src/lib/workspace-client";
import type {WorkspaceGroup} from "../src/lib/workspace-model";

function deferred<T>(){let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const group=(id:string)=>({id,name:id,members:[],children:[]}) as unknown as WorkspaceGroup;

test("superseded group requests follow the latest response without overwriting it",async()=>{
 const first=deferred<{groups:WorkspaceGroup[]}>(),second=deferred<{groups:WorkspaceGroup[]}>();let calls=0,failures=0;const committed:string[][]=[];
 const request=(()=>++calls===1?first.promise:second.promise) as typeof workspaceRequest;
 const loader=createWorkspaceGroupLoader(groups=>committed.push(groups.map(item=>item.id)),()=>{failures++;},request);
 const old=loader.load(),fresh=loader.load();first.resolve({groups:[group("old")]});second.resolve({groups:[group("new")]});
 assert.deepEqual(await Promise.all([old,fresh]),[true,true]);assert.deepEqual(committed,[["new"]]);assert.equal(failures,0);
});

test("latest failure is reported to superseded callers; invalidated reads do not publish",async()=>{
 const first=deferred<{groups:WorkspaceGroup[]}>(),second=deferred<{groups:WorkspaceGroup[]}>();let calls=0,commits=0,failures=0;
 const request=(()=>++calls===1?first.promise:second.promise) as typeof workspaceRequest;
 const loader=createWorkspaceGroupLoader(()=>{commits++;},()=>{failures++;},request);
 const old=loader.load(),fresh=loader.load();first.resolve({groups:[group("old")]});second.reject(new Error("offline"));
 assert.deepEqual(await Promise.all([old,fresh]),[false,false]);assert.equal(failures,1);assert.equal(commits,0);
 const pending=deferred<{groups:WorkspaceGroup[]}>();const cancelled=createWorkspaceGroupLoader(()=>{commits++;},()=>{failures++;},(()=>pending.promise) as typeof workspaceRequest);
 const result=cancelled.load();cancelled.invalidate();pending.resolve({groups:[group("late")]});assert.equal(await result,false);assert.equal(commits,0);assert.equal(failures,1);
});

test("group loader reports denied access distinctly from temporary failures and ignores stale successes",async()=>{
 const pending=deferred<{groups:WorkspaceGroup[]}>();let call=0;const results:string[][]=[],failures:boolean[]=[];
 const request=(()=>{call++;if(call===1)return pending.promise;if(call===2)return Promise.reject(Object.assign(new Error("denied"),{status:403}));if(call===3)return Promise.reject(Object.assign(new Error("offline"),{status:503}));return Promise.resolve({groups:[group("restored")]});}) as typeof workspaceRequest;
 const loader=createWorkspaceGroupLoader(value=>results.push(value.map(item=>item.id)),denied=>failures.push(denied),request);
 const older=loader.load(),denied=loader.load();pending.resolve({groups:[group("stale")]});
 assert.deepEqual(await Promise.all([older,denied]),[false,false]);assert.deepEqual(results,[]);assert.deepEqual(failures,[true]);
 assert.equal(await loader.load(),false);assert.deepEqual(failures,[true,false]);
 assert.equal(await loader.load(),true);assert.deepEqual(results,[["restored"]]);
});
