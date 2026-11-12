import test from "node:test";
import assert from "node:assert/strict";
import {taskDeleteReceipt,taskSaveReceipt} from "../src/lib/workspace-task-receipt";
import type {WorkspaceTask} from "../src/lib/workspace-client";

const task:WorkspaceTask={id:"task",title:"Prepare lesson",notes:"Notes",dueDate:null,courseId:null,sessionId:null,completed:false,version:0};
const body=JSON.stringify({title:"  Prepare lesson  ",notes:"Notes",dueDate:"",courseId:null,sessionId:null});
test("save receipt matches normalized input and the edited task",()=>{
 assert.deepEqual(taskSaveReceipt({task},body),task);
 assert.equal(taskSaveReceipt(null,body),null);
 assert.equal(taskSaveReceipt({task:{...task,title:"Different"}},body),null);
 assert.equal(taskSaveReceipt({task:{...task,completed:true}},body),null);
 assert.equal(taskSaveReceipt({task:{...task,id:"other",version:1}},body,task),null);
 assert.equal(taskSaveReceipt({task},body,task),null);
 assert.deepEqual(taskSaveReceipt({task:{...task,version:1}},body,task),{...task,version:1});
});
test("deletion requires an explicit receipt",()=>{
 assert.equal(taskDeleteReceipt({deleted:true}),true);
 for(const result of [null,{}, {deleted:false},{deleted:"true"}])assert.equal(taskDeleteReceipt(result),false);
});
