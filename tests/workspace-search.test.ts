import test from "node:test";
import assert from "node:assert/strict";
import {searchWorkspace} from "../src/lib/workspace-search";

test("global search distinguishes class pages, class chats, students and direct chats",()=>{
 const classes=[{id:"course",name:"Python 初级班"}],students=[{id:"student-1",name:"Python 学生"}],chats=[{id:"chat-1",peerName:"Python 老师"}];
 assert.deepEqual(searchWorkspace(" python ",classes,students,chats).map(item=>[item.kind,item.id]),[["class","course"],["student","student-1"],["classChat","course"],["directChat","chat-1"]]);
 assert.deepEqual(searchWorkspace("STUDENT-1",classes,students,chats).map(item=>item.kind),["student"]);
 assert.deepEqual(searchWorkspace(" ",classes,students,chats),[]);
 assert.deepEqual(searchWorkspace("missing",classes,students,chats),[]);
 const many=Array.from({length:40},(_,i)=>({id:String(i),name:`Python ${i}`}));
 assert.ok(searchWorkspace("python",many,students,chats).some(item=>item.kind==="directChat"));
 const extra={groups:[{id:"group",name:"Python group"}],lessons:[{scheduleId:"lesson",name:"Python class",sessionTitle:"Two pointers"}]};
 assert.deepEqual(searchWorkspace("two pointers",classes,students,chats,extra).map(item=>[item.kind,item.id]),[["lesson","lesson"]]);
 assert.ok(searchWorkspace("Python group",classes,students,chats,extra).some(item=>item.kind==="group"));
});
