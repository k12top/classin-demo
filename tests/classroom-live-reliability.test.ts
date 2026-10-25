import { classroomHeartbeatFailure } from "../src/lib/classroom/heartbeat-outcome";
import assert from "node:assert/strict";
import test from "node:test";
import { screenVideoPlan } from "../src/lib/classroom/screen-video-plan";
import { classroomMediaProfile } from "../src/lib/classroom/config";
import { parseCaptionAppearance, defaultCaptionAppearance } from "../src/lib/classroom/caption-appearance";
import { classroomActionRequiresRevision, requestClassroomAction } from "../src/lib/classroom/action-request";

test("sharing keeps teacher, assistant and stage student cameras alongside every screen", () => {
  const plan = screenVideoPlan([{id:"teacher"},{id:"assistant"},{id:"student"},{id:"screen-teacher"},{id:"screen-student"}], id => id.startsWith("screen-"));
  assert.deepEqual([...plan!], [["teacher",1],["assistant",1],["student",1],["screen-teacher",0],["screen-student",0]]);
  assert.equal(screenVideoPlan([{id:"teacher"}], () => false), null);
});
test("two shares plus many cameras stay within the FHD receive budget", () => {
  const visible = ["screen-one", "screen-two", ...Array.from({length:100},(_,i)=>`camera-${i}`)].map(id=>({id}));
  const plan = screenVideoPlan(visible,id=>id.startsWith("screen-"))!;
  let pixels = 0;
  for (const [id,type] of plan) {
    const size=id.startsWith("screen-") ? classroomMediaProfile.screen : classroomMediaProfile.camera.low;
    assert.equal(type,id.startsWith("screen-")?0:1);
    pixels+=size.width*size.height;
  }
  assert.ok(pixels<=1920*1080);
  assert.equal(plan.has("screen-one"),true);
  assert.equal(plan.has("screen-two"),true);
  assert.ok(plan.size<visible.length);
});
test("closing one board window survives unrelated runtime revisions and transient transport failure", async () => {
  let calls = 0;
  const commandIds: string[] = [];
  const action = {type:"removeBoardItem" as const,itemId:"student-camera"};
  assert.equal(classroomActionRequiresRevision(action), false);
  const result = await requestClassroomAction("/fixture", {action,expectedRevision:1,clientId:"fixture-tab"}, async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.expectedRevision, undefined);
    assert.equal(body.action.itemId, "student-camera");
    commandIds.push(body.commandId);
    return ++calls === 1 ? Response.json({code:"database_unavailable"},{status:503}) : Response.json({runtime:{revision:99}});
  }, async()=>{});
  assert.equal(result.response.status,200);
  assert.equal(commandIds[0],commandIds[1]);
});
test("caption preferences tolerate unavailable/corrupt storage and bound user values", () => {
  assert.deepEqual(parseCaptionAppearance("null"), defaultCaptionAppearance);
  assert.deepEqual(parseCaptionAppearance("invalid"), defaultCaptionAppearance);
  const parsed = parseCaptionAppearance(JSON.stringify({width:10000,height:-2,fontSize:99,opacity:-10,textColor:"red;display:none"}));
  assert.deepEqual(parsed,{width:95,height:80,fontSize:32,opacity:0,textColor:"#ffffff"});
  assert.equal(parseCaptionAppearance('{"opacity":35,"textColor":"#00aaff"}').opacity,35);
});

test("a lock-skipped runtime is retryable; an actual missing/ended room stays terminal", () => {
  const busy = classroomHeartbeatFailure({status:"missing",reason:"busy",refreshed:false});
  assert.equal(busy?.status,503);
  assert.equal(busy?.body.code,"heartbeat_busy");
  assert.equal(busy?.retryAfter,"2");
  assert.equal(classroomHeartbeatFailure(null)?.status,404);
  assert.equal(classroomHeartbeatFailure({status:"ended",reason:"ended",refreshed:false})?.body.code,"classroom_ended");
  assert.equal(classroomHeartbeatFailure({status:"live",reason:"refreshed",refreshed:true}),null);
});
