import assert from "node:assert/strict";
import test from "node:test";
import { presentCoursewareOnWhiteboard as present } from "../src/lib/classroom/courseware-presentation";
import type { ClassroomCoursewareSnapshot } from "../src/lib/classroom/types";
const doc = (id: string, type = "static") => ({ id, name: id, taskUuid: `task-${id}`, taskStatus: "Finished", whiteboardEnabled: true, type, conversion: type === "dynamic" ? { prefix: "https://mock.test/ppt" } : { scenes: [{ ppt: { src: "https://mock.test/pdf" } }] } }) as ClassroomCoursewareSnapshot;
function fixture() {
  const windows = new Map<string, { id: string; scenePath: string }>();
  const state = { count: 0, focus: "", minimized: true, restored: "" };
  const app = { canOperate: true, async insertDocs(input: {scenePath: string}) { const id = `app-${++state.count}`; windows.set(id, { id, scenePath: input.scenePath }); return id; }, manager: {
    queryOne: (id: string) => windows.get(id), queryAll: () => [...windows.values()],
    focusApp: (id: string) => { state.focus = id; }, setMinimized: (value: boolean) => { state.minimized = value; }, setBoxStatus: (id: string) => { state.restored = id; },
  } };
  return {app, state, windows};
}
test("PDF → PPT → PDF focuses existing app; repeat restores global and per-window minimization", async () => {
  const {app,state} = fixture(); const pdf = await present(app,doc("PDF")); await present(app,doc("PPT","dynamic"));
  await present(app,doc("PDF")); assert.equal(state.focus,pdf); assert.equal(state.count,2);
  state.minimized = true; await present(app,doc("PDF")); assert.equal(state.minimized,false); assert.equal(state.restored,pdf); assert.equal(state.count,2);
});
test("closed app is recreated; new SDK wrapper discovers existing task windows", async () => {
 const {app,state,windows} = fixture(); const id = await present(app,doc("PDF"));
 await present({...app},doc("PDF")); assert.equal(state.count,1);
 windows.delete(id); await present(app,doc("PDF")); assert.equal(state.count,2);
 await present(app,{...doc("PDF"), taskUuid:"new-task"}); assert.equal(state.count,3);
});
test("concurrent duplicate inserts share a promise; late earlier document never steals focus", async () => {
 const {app,state} = fixture(); const insert = app.insertDocs; let finish!:()=>void;
 app.insertDocs = async input => { if(input.scenePath.includes("PDF")) await new Promise<void>(r=>{finish=r;}); return insert(input); };
 const one=present(app,doc("PDF")); const duplicate=present(app,doc("PDF")); await present(app,doc("PPT","dynamic")); const latest=state.focus;
 finish(); await Promise.all([one,duplicate]); assert.equal(state.count,2); assert.equal(state.focus,latest);
});
test("read-only and missing SDK app IDs fail without false success", async () => {
 const {app,state} = fixture(); app.canOperate=false; await assert.rejects(present(app,doc("PDF")),/NOT_WRITABLE/); assert.equal(state.count,0);
 await assert.rejects(present({...app,canOperate:true,insertDocs:async()=>undefined},doc("PDF")),/NOT_CREATED/);
});

test("late insertion cannot focus an obsolete SDK app or a newly read-only board",async()=>{
 const f=fixture();let finish!:()=>void;const insert=f.app.insertDocs;f.app.insertDocs=async input=>{await new Promise<void>(r=>finish=r);return insert(input);};
 const stale=present(f.app,doc("PDF"),()=>false);finish();await stale;assert.equal(f.state.focus,"");
 const next=present(f.app,doc("PPT","dynamic"));f.app.canOperate=false;finish();await assert.rejects(next,/NOT_WRITABLE/);assert.equal(f.state.focus,"");
});
