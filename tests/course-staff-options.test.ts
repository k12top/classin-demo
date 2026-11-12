import test from "node:test";
import assert from "node:assert/strict";
import {removableCourseStaff} from "../src/lib/course-staff-options";

test("revocation includes lesson-only observers and assistants across lessons",()=>{
 const result=removableCourseStaff(
  [{id:"lead",name:"Lead"}],
  [{teachers:[{id:"lead",name:"Lead"},{id:"assistant",name:"Assistant"}],observers:[{id:"observer",name:"Observer"}]},
   {teachers:[],observers:[{id:"observer",name:"Observer"},{id:"second",name:"Second"}]}],
 );
 assert.deepEqual(result.map(person=>person.id),["lead","assistant","observer","second"]);
});
