import test from "node:test";
import assert from "node:assert/strict";
import {mergeAssignmentSubmissionPage} from "../src/lib/course-assignment-sync";

test("background refresh updates the first page without losing older loaded answers",()=>{
 const current={submissions:Array.from({length:150},(_,id)=>({id:String(id),content:"old"})),nextCursor:"149"};
 const next={submissions:Array.from({length:100},(_,id)=>({id:String(id),content:"new"})),nextCursor:"99"};
 const merged=mergeAssignmentSubmissionPage(current,next);
 assert.equal(merged.submissions.length,150);assert.equal(merged.submissions[0].content,"new");assert.equal(merged.submissions[149].content,"old");assert.equal(merged.nextCursor,"149");
});
test("background refresh uses the new cursor until older pages have been loaded",()=>{
 const current:{submissions:{id:string}[];nextCursor:string|null}={submissions:[{id:"a"}],nextCursor:null},next={submissions:[{id:"b"}],nextCursor:"b"};
 assert.deepEqual(mergeAssignmentSubmissionPage(current,next),next);
});
