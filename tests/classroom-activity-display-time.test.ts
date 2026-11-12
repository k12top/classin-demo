import test from "node:test";
import assert from "node:assert/strict";
import {activityDisplayTime} from "../src/lib/classroom/activity-display-time";

test("interaction timestamps follow the selected zone and the date's DST offset",()=>{
 const summer="2026-07-01T12:00:00.000Z",winter="2026-01-01T12:00:00.000Z";
 assert.equal(activityDisplayTime(summer,"en-GB","Asia/Shanghai"),"20:00");
 assert.equal(activityDisplayTime(summer,"en-GB","America/New_York"),"08:00");
 assert.equal(activityDisplayTime(winter,"en-GB","America/New_York"),"07:00");
});
