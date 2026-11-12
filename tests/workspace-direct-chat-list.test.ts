import test from "node:test";
import assert from "node:assert/strict";
import {createDirectChatListLoader,rememberOpenedChat,type DirectChat} from "../src/lib/workspace-direct-chat-list";
import type {workspaceRequest} from "../src/lib/workspace-client";

const chat=(id:string):DirectChat=>({id,courseId:"c",peerId:id,peerName:id,unread:0});
test("a slow older poll cannot replace a newly opened conversation",async()=>{
 let resolveOld!:(value:{chats:DirectChat[];nextCursor:null})=>void,calls=0;const committed:DirectChat[][]=[];
 const request=(async()=>{calls++;if(calls===1)return new Promise<{chats:DirectChat[];nextCursor:null}>(resolve=>{resolveOld=resolve;});return {chats:[chat("old"),chat("new")],nextCursor:null};}) as typeof workspaceRequest;
 const loader=createDirectChatListLoader(value=>committed.push(value),request),old=loader.load();
 await loader.load();resolveOld({chats:[chat("old")],nextCursor:null});await old;
 assert.deepEqual(committed.map(items=>items.map(item=>item.id)),[["old","new"]]);
});
test("a failed page or invalidated request cannot replace a complete list",async()=>{
 let commits=0;const repeated=(async()=>({chats:[chat("one")],nextCursor:"repeat"})) as typeof workspaceRequest;
 const loader=createDirectChatListLoader(()=>commits++,repeated);await assert.rejects(loader.load(),/Repeated cursor/);assert.equal(commits,0);
 let finish!:(value:{chats:DirectChat[];nextCursor:null})=>void;const delayed=(async()=>new Promise<{chats:DirectChat[];nextCursor:null}>(resolve=>{finish=resolve;})) as typeof workspaceRequest;
 const pending=createDirectChatListLoader(()=>commits++,delayed),read=pending.load();pending.invalidate();finish({chats:[chat("late")],nextCursor:null});await read;assert.equal(commits,0);
});
test("opening a confirmed chat survives a failed refresh and an older poll",async()=>{
 let items=[{...chat("existing"),unread:4}],finish!:(value:{chats:DirectChat[];nextCursor:null})=>void,calls=0;
 const request=(async()=>{calls++;if(calls===1)return new Promise<{chats:DirectChat[];nextCursor:null}>(resolve=>{finish=resolve;});throw new Error("offline");}) as typeof workspaceRequest;
 const loader=createDirectChatListLoader(value=>{items=value;},request),old=loader.load();
 loader.invalidate();items=rememberOpenedChat(items,{id:"new",courseId:"c",peerId:"new",peerName:"New"});
 await assert.rejects(loader.load(),/offline/);finish({chats:[chat("existing")],nextCursor:null});await old;
 assert.deepEqual(items.map(item=>[item.id,item.unread]),[["new",0],["existing",4]]);
 items=rememberOpenedChat(items,{id:"existing",courseId:"c",peerId:"existing",peerName:"Updated"});assert.equal(items[0].unread,4);
});


test("confirmed denial clears chats while offline and stale failures preserve them",async()=>{
 let current=[chat("old")],rejectOld!:(error:Error)=>void,calls=0;
 const request=(async()=>{calls++;if(calls===1)throw Object.assign(new Error("offline"),{status:503});if(calls===2)return new Promise((_resolve,reject)=>{rejectOld=reject;});if(calls===3)return {chats:[chat("new")],nextCursor:null};throw Object.assign(new Error("denied"),{status:401});}) as typeof workspaceRequest;
 const loader=createDirectChatListLoader(value=>{current=value;},request);
 await assert.rejects(loader.load(),/offline/);assert.deepEqual(current.map(item=>item.id),["old"]);
 const stale=loader.load();await loader.load();rejectOld(Object.assign(new Error("old denied"),{status:403}));await assert.rejects(stale,/old denied/);assert.deepEqual(current.map(item=>item.id),["new"]);
 await assert.rejects(loader.load(),/denied/);assert.deepEqual(current,[]);
});
