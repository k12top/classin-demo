import test from "node:test";
import assert from "node:assert/strict";
import {taskToggleOutcome,taskToggleReceipt} from "../src/lib/workspace-task-toggle";
import type {WorkspaceTask} from "../src/lib/workspace-client";

const task:WorkspaceTask={id:"one",title:"Prepare lesson",notes:"",dueDate:null,courseId:null,sessionId:null,completed:false,version:1};
test("reconcile an uncertain toggle only with a fresh matching task",()=>{
 assert.equal(taskToggleOutcome([{...task,completed:true,version:2}],task.id,true),"confirmed");
 assert.equal(taskToggleOutcome([task],task.id,true),"changed");
 assert.equal(taskToggleOutcome([],task.id,true),"changed");
 assert.equal(taskToggleOutcome(null,task.id,true),"unknown");
 assert.equal(taskToggleOutcome([{...task,completed:false}],task.id,false),"confirmed");
});
test("accept only a complete receipt for the requested task and new version",()=>{
 const receipt={...task,completed:true,version:2};
 assert.deepEqual(taskToggleReceipt({task:receipt},task,true),receipt);
 for(const value of [null,{}, {task:null},{task:{...receipt,id:"other"}},{task:{...receipt,version:1}},{task:{...receipt,completed:false}},{task:{...receipt,notes:null}}])assert.equal(taskToggleReceipt(value,task,true),null);
});
