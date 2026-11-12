import test from "node:test";
import assert from "node:assert/strict";
import {assignmentReviewInput} from "../src/lib/course-assignment-review";
import {parsePendingReview,reviewPendingKey} from "../src/lib/course-assignment-review-pending";

test("review validates the answer version, result, feedback and review version",()=>{
 const valid={submissionVersion:2,expectedVersion:null,result:"needs_revision",feedback:"  Explain  "};
 assert.deepEqual(assignmentReviewInput(valid),{...valid,feedback:"Explain"});
 for(const value of [{...valid,result:["correct"]},{...valid,result:"invalid"},{...valid,submissionVersion:-1},{...valid,expectedVersion:0.5},{...valid,feedback:"x".repeat(4001)}])assert.throws(()=>assignmentReviewInput(value));
});
test("review recovery is isolated to the teacher and submission",()=>{
 assert.notEqual(reviewPendingKey("one","c","a","s"),reviewPendingKey("two","c","a","s"));
 assert.notEqual(reviewPendingKey("one","c","a","s"),reviewPendingKey("one","c","a","other"));
 const valid={requestId:"request-123",submissionVersion:2,expectedVersion:0,result:"correct",feedback:"Good"};assert.deepEqual(parsePendingReview(JSON.stringify(valid)),valid);
 assert.equal(parsePendingReview(JSON.stringify({...valid,submissionVersion:-1})),null);
 assert.equal(parsePendingReview(JSON.stringify({...valid,requestId:"bad"})),null);
});
