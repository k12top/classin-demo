import test from "node:test";
import assert from "node:assert/strict";
import {workspaceConversationList} from "../src/lib/workspace-conversation-list";
import type {WorkspaceCourse} from "../src/lib/workspace-model";
const courses=[{id:"one",name:"Python"},{id:"two",name:"Math"}] as WorkspaceCourse[];
const direct=[{id:"d",courseId:"one",peerId:"s",peerName:"Alice",unread:1,preview:{content:"Hi",createdAt:"2026-01-02T00:00:00Z"}}];
const previews={one:{content:"Later",createdAt:"2026-01-03T00:00:00Z"}};
test("interleaves authorized conversations by latest activity with stable empty states",()=>{
 const rows=workspaceConversationList(courses,direct,previews,"","all");
 assert.deepEqual(rows.map(row=>row.kind==="class"?row.course.id:row.chat.id),["one","d","two"]);
 assert.deepEqual(workspaceConversationList(courses,direct,previews," alice ","all").map(row=>row.kind),["direct"]);
 assert.deepEqual(workspaceConversationList(courses,direct,previews,"","direct").map(row=>row.kind),["direct"]);
 assert.deepEqual(workspaceConversationList(courses,[],{},"","all").map(row=>row.kind==="class"?row.course.id:""),["one","two"]);
});
