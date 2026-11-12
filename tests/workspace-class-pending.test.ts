import test from "node:test";
import assert from "node:assert/strict";
import {pendingClassKey,parsePendingClass} from "../src/lib/workspace-class-pending";
import {courseCreationHash} from "../src/lib/course-creation-idempotency";

test("pending class requests remain bound to the account and exact schedule",()=>{
 const body=JSON.stringify({name:"课程",description:"",roomType:4,courseKind:"series",startTime:"2028-01-01T10:00:00.000Z",endTime:"2028-01-01T11:00:00.000Z",timezone:"Asia/Shanghai"});
 const saved=parsePendingClass(JSON.stringify({requestId:"request-123",body}));
 assert.equal(saved?.body,body);assert.equal(saved?.timezone,"Asia/Shanghai");
 assert.notEqual(pendingClassKey("a"),pendingClassKey("b"));
 for(const bad of [{name:"",description:"",roomType:4,courseKind:"series"},{name:"A",description:"",roomType:4,courseKind:"series",startTime:"bad",endTime:"bad",timezone:"UTC"},{name:"A",description:"",roomType:10,courseKind:"series"}])assert.equal(parsePendingClass(JSON.stringify({requestId:"request-123",body:JSON.stringify(bad)})),null);
});
test("class creation fingerprints bind all input while ignoring object key order",()=>{
 assert.equal(courseCreationHash({name:"A",settings:{x:1,y:2}}),courseCreationHash({settings:{y:2,x:1},name:"A"}));
 assert.notEqual(courseCreationHash({name:"A"}),courseCreationHash({name:"B"}));
});
