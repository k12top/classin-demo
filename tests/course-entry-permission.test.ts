import test from "node:test";
import assert from "node:assert/strict";
import {hasCourseEntryAccess} from "../src/lib/course-entry-permission";

test("session-only roster members enter course workspace without becoming course managers",()=>{
 const limited={canTeach:false,directStudent:false,groupStudent:false,limitedToSessionId:"authorized-session"};
 assert.equal(hasCourseEntryAccess(limited),true);
 assert.equal(hasCourseEntryAccess({...limited,limitedToSessionId:null}),false);
 assert.equal(limited.canTeach,false);
});
test("ordinary course teachers, students and group members retain access",()=>{
 const base={canTeach:false,directStudent:false,groupStudent:false};
 for(const field of ["canTeach","directStudent","groupStudent"] as const)assert.equal(hasCourseEntryAccess({...base,[field]:true}),true);
 assert.equal(hasCourseEntryAccess(base),false);
});
