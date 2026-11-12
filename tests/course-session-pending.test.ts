import test from "node:test";
import assert from "node:assert/strict";
import {parsePendingLesson,pendingLessonKey,validLessonCreationReceipt} from "../src/lib/course-session-pending";
const body=JSON.stringify({title:"Math",schedule:{type:"single",startTime:"2030-01-01T09:00:00.000Z",endTime:"2030-01-01T10:00:00.000Z",timezone:"UTC"}});
test("lesson recovery validates and preserves the exact body",()=>{
 const result=parsePendingLesson(JSON.stringify({requestId:"request_123",body}));assert.equal(result?.body,body);assert.equal(result?.expectedCount,1);assert.equal(result?.title,"Math");
 assert.notEqual(pendingLessonKey("a","c"),pendingLessonKey("b","c"));assert.notEqual(pendingLessonKey("a","c"),pendingLessonKey("a","d"));
 for(const raw of [null,"{}",JSON.stringify({requestId:"invalid",body}),JSON.stringify({requestId:"request_123",body:'{}'}),"x".repeat(200001)])assert.equal(parsePendingLesson(raw),null);
});
test("recurring recovery and receipt require the complete distinct set",()=>{
 const recurring=JSON.stringify({schedule:{type:"recurring",firstDate:"2030-01-01",localStartTime:"10:00",weekdays:[1],count:2}});
 assert.equal(parsePendingLesson(JSON.stringify({requestId:"request_123",body:recurring}))?.expectedCount,2);
 assert.equal(validLessonCreationReceipt({sessions:[{id:"1"},{id:"2"}]},2),true);
 for(const value of [{},{sessions:[]},{sessions:[{id:"1"},{id:"1"}]},{sessions:[{id:"1"}]},null])assert.equal(validLessonCreationReceipt(value,2),false);
});
