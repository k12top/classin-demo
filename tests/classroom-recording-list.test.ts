import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import * as playback from "../src/lib/classroom/recording-playback";
import * as timeline from "../src/lib/classroom/recording-playback-timeline";
import * as stopState from "../src/lib/classroom/recording-stop-state";
function fixture({allowed=true,teaching=false,attention=false,requested=true,ended=false}={}){
 let queued=0,repaired=0;
 const row={id:"recording",status:"processing",provider:"agora",mode:"web",files:[] as unknown[],providerState:(attention?{stopControl:{...stopState.newRecordingStopControl(),attention:"Verify provider"}}:{}) as Record<string,unknown>,createdAt:new Date(),
  playbackObjectKey:"recordings/part.m3u8",playbackFormat:"hls",stopRequestedAt:requested?new Date():null,startedAt:new Date(),stoppedAt:null as Date|null,errorMessage:"Verify provider",failureStage:attention?"stop-attention":null};
 const api=loadModule<typeof import("../src/app/api/sessions/[sessionId]/recordings/route")>("src/app/api/sessions/[sessionId]/recordings/route.ts",{
 "@/lib/classroom/server/recording-stop": {finalizeEndedRecordingTime:async(id:string)=>{assert.equal(id,row.id);repaired++;row.stoppedAt=new Date();return row;}},
 "next/server":{after:()=>{queued++;},NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},
 "@/app/api/courses/[id]/recording/route":{},"@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed,teaching})},"@/lib/db":{prisma:{courseSession:{findUnique:async()=>({courseId:"course",status:ended?"finished":"live"})},classroomRecording:{findMany:async()=>[row]}}},"@/lib/session":{getSessionFromRequest:async()=>({userId:"student"})},
 "@/lib/classroom/server/recording-orchestrator":{},"@/lib/classroom/recording-playback":playback,"@/lib/classroom/recording-playback-timeline":timeline,"@/lib/classroom/recording-reconciliation":{recordingNeedsReconciliation:()=>true},"@/lib/classroom/recording-asset-discovery":{recordingAssetDiscoveryDue:()=>false,recordingAssetDiscoveryPollMs:()=>null},"@/lib/classroom/server/recording-asset-discovery":{},"@/lib/classroom/recording-stop-state":stopState,
 });
 return {row,get:()=>api.GET(new Request("https://example.test") as never,{params:Promise.resolve({sessionId:"session"})}),get queued(){return queued;},get repaired(){return repaired;}};
}
test("available playback remains separate from unconfirmed exit, without fabricated completion",async()=>{const f=fixture();const body=await (await f.get()).json();assert.equal(body.recordings[0].status,"processing");assert(body.recordings[0].playbackUrl);assert.equal(body.recordings[0].stoppedAt,null);assert.equal(body.recordings[0].errorMessage,null);assert.equal(f.queued,1);});
test("attention stops automatic refresh/reconciliation and teacher sees the real warning",async()=>{const f=fixture({attention:true,teaching:true});const body=await (await f.get()).json();assert.equal(body.refreshAfterMs,null);assert.equal(f.queued,0);assert.equal(body.recordings[0].failureStage,"stop-attention");assert.equal(body.recordings[0].status,"processing");assert(body.recordings[0].playbackUrl);});
test("an unrequested live segment is not exposed as a replay",async()=>{const f=fixture({requested:false});const body=await (await f.get()).json();assert.equal(body.recordings[0].playbackUrl,null);});
test("existing enrollment authorization still denies unrelated accounts before recorder reads",async()=>{const f=fixture({allowed:false});assert.equal((await f.get()).status,403);assert.equal(f.queued,0);});
test("authorized historical replay repairs missing end time even after verification is exhausted",async()=>{
 const f=fixture({ended:true,attention:true});const body=await(await f.get()).json();
 assert(body.recordings[0].stoppedAt);assert(body.recordings[0].playbackUrl);
 assert.equal(body.recordings[0].status,"processing");assert.equal(f.repaired,1);assert.equal(f.queued,0);
});
test("unauthorized replay cannot backfill ended recording times",async()=>{
 const f=fixture({ended:true,allowed:false});assert.equal((await f.get()).status,403);assert.equal(f.repaired,0);
});

test("web recording file timestamps locate each MP4 instead of dropping all clip boundaries",async()=>{
 const f=fixture();const start=Date.parse("2026-11-12T00:00:01Z");
 Object.assign(f.row,{status:"completed",createdAt:new Date(start-1000),startedAt:new Date(start+500),stoppedAt:new Date(start+480_000),playbackObjectKey:null,playbackFormat:null,providerState:{fileNamePrefix:["recordings","lesson","task"]},files:[
  {filename:"rec_0.mp4",sliceStartTime:start},
  {fileName:"rec_1.mp4",sliceStartTime:(start+240_000)/1000},
 ]});
 const body=await(await f.get()).json();
 assert.deepEqual(body.recordings.map((r:{id:string;startedAt:string|null;stoppedAt:string|null})=>({id:r.id,startedAt:r.startedAt,stoppedAt:r.stoppedAt})),[
  {id:"recording:0",startedAt:new Date(start).toISOString(),stoppedAt:new Date(start+240_000).toISOString()},
  {id:"recording:1",startedAt:new Date(start+240_000).toISOString(),stoppedAt:new Date(start+480_000).toISOString()},
 ]);
});
