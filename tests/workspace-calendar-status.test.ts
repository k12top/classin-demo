import assert from "node:assert/strict";
import test from "node:test";
import {workspaceCalendarDataStatus} from "../src/lib/workspace-calendar";

test("calendar declares an empty day only when visible data sources are ready",()=>{
 const ready={visible:true,ready:true,failed:false},pending={visible:true,ready:false,failed:false},failed={visible:true,ready:false,failed:true};
 assert.equal(workspaceCalendarDataStatus([ready,pending]),"loading");
 assert.equal(workspaceCalendarDataStatus([ready,failed]),"error");
 assert.equal(workspaceCalendarDataStatus([ready,{...failed,visible:false}]),"ready");
 assert.equal(workspaceCalendarDataStatus([{...ready,failed:true}]),"ready");
 assert.equal(workspaceCalendarDataStatus([ready,ready,ready]),"ready");
});
