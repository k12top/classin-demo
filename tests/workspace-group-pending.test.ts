import test from "node:test";
import assert from "node:assert/strict";
import {pendingGroupKey,parsePendingGroup} from "../src/lib/workspace-group-pending";

test("pending group creation is account scoped and rejects altered request shapes",()=>{
 const body=JSON.stringify({action:"create",name:"分组",parentId:null});
 const raw=JSON.stringify({requestId:"request-123",body});
 assert.notEqual(pendingGroupKey("one"),pendingGroupKey("two"));
 assert.deepEqual(parsePendingGroup(raw),{requestId:"request-123",body,name:"分组"});
 for(const payload of [{action:"delete",name:"分组",parentId:null},{action:"create",name:"",parentId:null},{action:"create",name:"分组",parentId:"other"}])assert.equal(parsePendingGroup(JSON.stringify({requestId:"request-123",body:JSON.stringify(payload)})),null);
});
