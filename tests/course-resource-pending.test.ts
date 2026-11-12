import test from "node:test";
import assert from "node:assert/strict";
import {parsePendingResource,pendingResourceKey} from "../src/lib/course-resource-pending";

test("resource recovery preserves the exact request and course scope",()=>{
 const scope={userId:"teacher",courseId:"class",programId:"program",unitId:"unit"},body=JSON.stringify({sourceId:"file",name:"练习.pdf",programId:"program",unitId:"unit"}),raw=JSON.stringify({requestId:"request-id-1",body});
 assert.deepEqual(parsePendingResource(raw,scope),{requestId:"request-id-1",body,sourceId:"file",name:"练习.pdf"});
 assert.equal(parsePendingResource(raw,{...scope,unitId:null}),null);
 assert.notEqual(pendingResourceKey(scope),pendingResourceKey({...scope,userId:"other"}));
 assert.notEqual(pendingResourceKey(scope),pendingResourceKey({...scope,courseId:"other"}));
});
test("malformed pending resource cannot become a retry",()=>{
 const scope={userId:"t",courseId:"c",programId:null,unitId:null};
 for(const body of [{sourceId:"",name:"a.pdf",programId:null,unitId:null},{sourceId:"f",name:"../bad",programId:null,unitId:null},{sourceId:"f",name:"a",programId:"other",unitId:null}])assert.equal(parsePendingResource(JSON.stringify({requestId:"request-id-1",body:JSON.stringify(body)}),scope),null);
 assert.equal(parsePendingResource("invalid",scope),null);
});
