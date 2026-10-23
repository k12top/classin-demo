import assert from "node:assert/strict";
import test from "node:test";
import { loadModule } from "./helpers/load-module";
import * as playback from "../src/lib/classroom/recording-playback";
import * as stopState from "../src/lib/classroom/recording-stop-state";
function fixture({allowed=true,teaching=false,attention=false,requested=true}={}){
 let queued=0;
 const row={id:"recording",status:"processing",provider:"agora",mode:"web",files:[],providerState:attention?{stopControl:{...stopState.newRecordingStopControl(),attention:"Verify provider"}}:{},
  playbackObjectKey:"recordings/part.m3u8",playbackFormat:"hls",stopRequestedAt:requested?new Date():null,startedAt:new Date(),stoppedAt:null,errorMessage:"Verify provider",failureStage:attention?"stop-attention":null};
 const api=loadModule<typeof import("../src/app/api/sessions/[sessionId]/recordings/route")>("src/app/api/sessions/[sessionId]/recordings/route.ts",{
 "next/server":{after:()=>{queued++;},NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},
 "@/app/api/courses/[id]/recording/route":{},"@/lib/courseware-access":{resolveCoursewareAccess:async()=>({allowed,teaching})},"@/lib/db":{prisma:{courseSession:{findUnique:async()=>({courseId:"course"})},classroomRecording:{findMany:async()=>[row]}}},"@/lib/session":{getSessionFromRequest:async()=>({userId:"student"})},
 "@/lib/classroom/server/recording-orchestrator":{},"@/lib/classroom/recording-playback":playback,"@/lib/classroom/recording-reconciliation":{recordingNeedsReconciliation:()=>true},"@/lib/classroom/recording-asset-discovery":{recordingAssetDiscoveryDue:()=>false,recordingAssetDiscoveryPollMs:()=>null},"@/lib/classroom/server/recording-asset-discovery":{},"@/lib/classroom/recording-stop-state":stopState,
 });
 return {get:()=>api.GET(new Request("https://example.test") as never,{params:Promise.resolve({sessionId:"session"})}),get queued(){return queued;}};
}
test("available playback remains separate from unconfirmed exit, without fabricated completion",async()=>{const f=fixture();const body=await (await f.get()).json();assert.equal(body.recordings[0].status,"processing");assert(body.recordings[0].playbackUrl);assert.equal(body.recordings[0].stoppedAt,null);assert.equal(body.recordings[0].errorMessage,null);assert.equal(f.queued,1);});
test("attention stops automatic refresh/reconciliation and teacher sees the real warning",async()=>{const f=fixture({attention:true,teaching:true});const body=await (await f.get()).json();assert.equal(body.refreshAfterMs,null);assert.equal(f.queued,0);assert.equal(body.recordings[0].failureStage,"stop-attention");assert.equal(body.recordings[0].status,"processing");assert(body.recordings[0].playbackUrl);});
test("an unrequested live segment is not exposed as a replay",async()=>{const f=fixture({requested:false});const body=await (await f.get()).json();assert.equal(body.recordings[0].playbackUrl,null);});
test("existing enrollment authorization still denies unrelated accounts before recorder reads",async()=>{const f=fixture({allowed:false});assert.equal((await f.get()).status,403);assert.equal(f.queued,0);});
