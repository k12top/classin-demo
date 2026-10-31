import assert from "node:assert/strict";
import test from "node:test";
import { activityAnswerText, activityQuestionJudgment, objectiveResultsReady, type ActivityGrade, type ActivityQuestion, type ActivityResponse } from "../src/lib/classroom/activities";
const question:ActivityQuestion={id:"q",type:"single",prompt:"2x + 3y = 7; x - y = 1",points:1,options:[{id:"a",text:"x=2, y=1"},{id:"b",text:"x=1, y=2"}],correct:["a"]};
const response=(answers:ActivityResponse["answers"],grading:ActivityResponse["grading"]):ActivityResponse=>({id:"r",userId:"s",displayName:"Student",answers,grading,feedback:null,version:1,submittedAt:"",updatedAt:""});
test("end publishes objective results only after every submitted answer has an authoritative grade",()=>{
 assert.equal(objectiveResultsReady("quiz",{questions:[question]},[{q:0},{q:1}]),true);
 assert.equal(objectiveResultsReady("quiz",{questions:[question]},[]),true);
 const invalid:Array<ActivityGrade|null>=[null,{q:null},{q:NaN},{q:2},{}];
 for(const grade of invalid)assert.equal(objectiveResultsReady("quiz",{questions:[question]},[grade]),false);
 assert.equal(objectiveResultsReady("quiz",{questions:[{...question,type:"essay"}]},[{q:1}]),false);
 assert.equal(objectiveResultsReady("poll",{questions:[question]},[{q:0}]),false);
});
test("a wrong choice is explicitly incorrect; zero-point questions do not make every answer correct",()=>{
 assert.equal(activityQuestionJudgment(question,response({q:["b"]},{q:0})),"incorrect");
 assert.equal(activityQuestionJudgment(question,response({q:["a"]},{q:1})),"correct");
 assert.equal(activityQuestionJudgment({...question,points:0},response({q:["b"]},{q:0})),"incorrect");
 assert.equal(activityQuestionJudgment(question,response({q:["a"]},null)),"pending");
 assert.equal(activityQuestionJudgment(question,null),"unanswered");
 assert.equal(activityAnswerText(question,["a"]),"A · x=2, y=1");
});
test("written responses retain pending/partial/manual distinctions",()=>{
 const q={...question,type:"essay" as const,points:10,options:[],correct:undefined};
 assert.equal(activityQuestionJudgment(q,response({q:"answer"},{q:null})),"pending");
 assert.equal(activityQuestionJudgment(q,response({q:"answer"},{q:6})),"partial");
 assert.equal(activityQuestionJudgment(q,{...response({q:"answer"},{q:10}),aiReview:{q:{status:"manual",score:10,correct:true}}}),"correct");
});
