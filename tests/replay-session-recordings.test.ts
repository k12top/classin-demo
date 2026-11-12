import assert from "node:assert/strict";
import test from "node:test";
import {replayRecordingsForSession,resolveReplayLesson} from "../src/lib/replay-session-recordings";

test("replay media stays scoped to its lesson and disappears after access is denied",()=>{
 const data={sessionId:"lesson-a",items:[{id:"recording-a"}]};
 assert.deepEqual(replayRecordingsForSession(data,"lesson-a",""),data.items);
 assert.deepEqual(replayRecordingsForSession(data,"lesson-b",""),[]);
 assert.deepEqual(replayRecordingsForSession(data,"lesson-a","lesson-a"),[]);
 assert.deepEqual(replayRecordingsForSession(data,"",""),[]);
});

test("an unavailable lesson link never opens another lesson's recording",()=>{
 const lessons=[{id:"a",status:"finished",_count:{recordings:0}},{id:"b",status:"finished",_count:{recordings:1}}];
 assert.deepEqual(resolveReplayLesson(lessons,"missing"),{sessionId:"",unavailable:true});
 assert.deepEqual(resolveReplayLesson(lessons,"a"),{sessionId:"a",unavailable:false});
 assert.deepEqual(resolveReplayLesson(lessons,""),{sessionId:"b",unavailable:false});
 assert.deepEqual(resolveReplayLesson([],""),{sessionId:"",unavailable:false});
});
