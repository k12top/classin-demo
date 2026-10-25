import test from "node:test";
import assert from "node:assert/strict";
import { lessonClock, lessonClockText } from "../src/lib/classroom/lesson-clock";
const schedule = {startTime:"2026-10-25T02:00:00Z",endTime:"2026-10-25T03:00:00Z",startedAt:"2026-10-25T02:02:00Z",graceEndsAt:"2026-10-25T03:15:00Z"};
test("waiting and late opening never use a running lesson timer",()=>{
 assert.deepEqual(lessonClock({...schedule,status:"waiting",now:Date.parse("2026-10-25T01:58:00Z")}),{phase:"waiting",tone:"neutral",seconds:120,elapsed:null,overtime:0,remainingGrace:null});
 const late=lessonClock({...schedule,status:"waiting",now:Date.parse("2026-10-25T02:03:00Z")});assert.equal(late.phase,"ready");assert.equal(late.seconds,180);assert.equal(late.tone,"warning");
});
test("normal lesson time uses actual start while overtime uses scheduled end",()=>{
 const live=lessonClock({...schedule,status:"live",now:Date.parse("2026-10-25T02:30:00Z")});assert.equal(live.seconds,28*60);assert.equal(live.tone,"active");
 const extra=lessonClock({...schedule,status:"live",now:Date.parse("2026-10-25T03:08:00Z")});assert.equal(extra.phase,"overtime");assert.equal(extra.seconds,8*60);assert.equal(extra.remainingGrace,7*60);assert.equal(extra.elapsed,66*60);
});
test("final grace minute is red; passing a deadline does not invent ended state",()=>{
 const final=lessonClock({...schedule,status:"live",now:Date.parse("2026-10-25T03:14:00Z")});assert.equal(final.phase,"closing");assert.equal(final.tone,"danger");
 const deadline=lessonClock({...schedule,status:"live",now:Date.parse("2026-10-25T03:16:00Z")});assert.equal(deadline.phase,"closing");assert.equal(deadline.remainingGrace,0);
});
test("server extension returns to live, ended state never keeps accumulating",()=>{
 assert.equal(lessonClock({...schedule,status:"live",endTime:"2026-10-25T03:30:00Z",now:Date.parse("2026-10-25T03:08:00Z")}).phase,"live");
 assert.equal(lessonClock({...schedule,status:"ended",now:Date.parse("2026-10-26T03:08:00Z")}).seconds,null);
 assert.equal(lessonClockText(3661),"1:01:01");assert.equal(lessonClockText(-5),"00:00");
});

test("a missing actual start is unknown, rather than a fabricated zero duration",()=>{
 const value=lessonClock({status:"live",now:Date.now()});assert.equal(value.seconds,null);assert.equal(value.elapsed,null);
});
