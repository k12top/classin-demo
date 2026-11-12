import test from "node:test";
import assert from "node:assert/strict";
import {restoreChatOutbox,retryChatAfterReconnect,pendingChatRetries} from "../src/lib/workspace-chat-outbox";

test("restored drafts and pending messages retain conversation and retry identity",()=>{
 const raw=JSON.stringify({drafts:{classA:"unfinished",'direct:private':"another"},pending:{classA:[{clientId:"message-id-1",content:"Hello",status:"sending"}],"direct:private":[{clientId:"message-id-2",content:"你好",status:"failed"}]}});
 const saved=restoreChatOutbox(raw);
 assert.equal(saved.drafts.classA,"unfinished");assert.equal(saved.drafts["direct:private"],"another");
 assert.deepEqual(saved.pending.classA,[{clientId:"message-id-1",content:"Hello",status:"failed"}]);
 assert.deepEqual(saved.pending["direct:private"],[{clientId:"message-id-2",content:"你好",status:"failed"}]);
});
test("malformed, oversized and duplicate pending entries cannot become outgoing messages",()=>{
 const saved=restoreChatOutbox(JSON.stringify({drafts:{course:42},pending:{course:[null,{clientId:"bad",content:"x"},{clientId:"valid-id-1",content:"x"},{clientId:"valid-id-1",content:"duplicate"},{clientId:"valid-id-2",content:"x".repeat(1201)}]}}));
 assert.equal(saved.drafts.course,undefined);assert.deepEqual(saved.pending.course,[{clientId:"valid-id-1",content:"x",status:"failed"}]);
 assert.equal(Object.keys(restoreChatOutbox("invalid").pending).length,0);
});

test("a transient request finishing after reconnect is retried only while online",()=>{
 assert.equal(retryChatAfterReconnect(new Error("timeout"),0,1,true),true);
 assert.equal(retryChatAfterReconnect({status:503},3,4,true),true);
 assert.equal(retryChatAfterReconnect({status:429},3,4,true),true);
 assert.equal(retryChatAfterReconnect({status:403},3,4,true),false);
 assert.equal(retryChatAfterReconnect({status:409},3,4,true),false);
 assert.equal(retryChatAfterReconnect(new Error("timeout"),1,1,true),false);
 assert.equal(retryChatAfterReconnect(new Error("timeout"),1,2,false),false);
});

test("concurrent reconnect retries only resend their own still-pending messages",()=>{
 const outbox=restoreChatOutbox(JSON.stringify({pending:{course:[{clientId:"message-id-1",content:"one"},{clientId:"message-id-2",content:"two"},{clientId:"message-id-3",content:"three"}],"direct:chat":[{clientId:"message-id-1",content:"private"}]}}));
 const targets=[{storageKey:"user-a",conversation:"course",clientId:"message-id-1"},{storageKey:"user-a",conversation:"direct:chat",clientId:"message-id-1"},{storageKey:"user-a",conversation:"course",clientId:"message-id-1"},{storageKey:"user-b",conversation:"course",clientId:"message-id-2"},{storageKey:"user-a",conversation:"course",clientId:"already-acknowledged"}];
 assert.deepEqual(pendingChatRetries(outbox,"user-a",targets).map(item=>[item.conversation,item.message.content]),[["course","one"],["direct:chat","private"]]);
});
test("scheduled messages remain retryable and reload safely as failed",()=>{
 const outbox={drafts:{},pending:{course:[{clientId:"message-id-1",content:"waiting",status:"retrying" as const},{clientId:"message-id-2",content:"sending",status:"sending" as const}]}};
 const targets=[{storageKey:"user",conversation:"course",clientId:"message-id-1"},{storageKey:"user",conversation:"course",clientId:"message-id-2"}];
 assert.deepEqual(pendingChatRetries(outbox,"user",targets).map(item=>item.message.clientId),["message-id-1"]);
 assert.equal(restoreChatOutbox(JSON.stringify(outbox)).pending.course[0].status,"failed");
});
