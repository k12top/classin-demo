import test from "node:test";
import assert from "node:assert/strict";
import {needsSessionRosterRule,supportedSessionTeacherRules} from "../src/lib/course-session-roster-rules";

test("inherited rosters retain temporary selected members and explicit exclusions",()=>{
 assert.equal(needsSessionRosterRule("inherit",true,true),false);
 assert.equal(needsSessionRosterRule("inherit",true,false),true);
 assert.equal(needsSessionRosterRule("inherit",false,true),true);
 assert.equal(needsSessionRosterRule("inherit",false,false),true);
});
test("custom rosters record selected and excluded members",()=>{
 for(const selected of [true,false])for(const inherited of [true,false])assert.equal(needsSessionRosterRule("custom",selected,inherited),true);
});
test("legacy roster editors reject read-only and unknown roles instead of promoting them",()=>{
 assert.equal(supportedSessionTeacherRules(undefined),true);
 assert.equal(supportedSessionTeacherRules([{userId:"a"},{userId:"b",role:"assistant"},{userId:"c",role:"teacher"}]),true);
 for(const value of [[{userId:"a",role:"observer"}],[{userId:"a",role:"unknown"}],[null],"invalid"])assert.equal(supportedSessionTeacherRules(value),false);
});
