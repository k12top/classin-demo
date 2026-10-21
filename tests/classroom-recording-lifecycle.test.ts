/* eslint-disable @typescript-eslint/no-explicit-any -- database/provider test boundaries */
import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "node:crypto";
import { loadModule } from "./helpers/load-module";
import * as stopState from "../src/lib/classroom/recording-stop-state";
import { classroomEmptyGraceMs, classroomEmptySince } from "../src/lib/classroom/empty-room-policy";
import { CLASSROOM_RECONNECT_WINDOW_MS } from "../src/lib/classroom/presence";

type Row = Record<string, any>; // In-memory database boundary; actual orchestration code is executed below.
function fixture(overrides: Row = {}) {
  let now = 1_800_000_000_000;
  const row: Row = { id:"recording", courseId:"course", sessionId:"session", provider:"agora", status:"recording", mode:"web",
    resourceId:"resource", providerSessionId:"sid", recorderUserId:"bot", providerState:{mode:"web"}, stopRequestedAt:null,
    stoppedAt:null, lastProviderCheckAt:null, stopRetryCount:0, playbackObjectKey:null, playbackFormat:null, session:{status:"finished"}, ...overrides };
  let stopCalls=0,queryCalls=0;
  const provider = { stop: async():Promise<any> => { stopCalls++; return {files:[],playbackObjectKey:"asset.m3u8",playbackFormat:"hls",providerState:{serverResponse:{status:6}}}; },
    query: async():Promise<any> => { queryCalls++; return {active:true,files:[],playbackObjectKey:null,playbackFormat:null,providerState:{serverResponse:{status:5}}}; } };
  const table = {findUnique:async()=>({...row}),findUniqueOrThrow:async()=>({...row}),findMany:async()=>[{...row}],
    update:async({data}:Row)=>{Object.assign(row,data);return {...row};},updateMany:async({where,data}:Row)=>{
      if(typeof where.status === "string" && row.status !== where.status) return {count:0};
      Object.assign(row,data);return {count:1};}};
  // Serial transaction boundary models PostgreSQL row lock; provider calls are outside it.
  let tail=Promise.resolve();
  const tx={$queryRaw:async()=>[],classroomRecording:table};
  const prisma={classroomRecording:table,$transaction:<T>(fn:(tx:any)=>Promise<T>)=>{
    const operation=tail.then(()=>fn(tx));tail=operation.then(()=>undefined,()=>undefined);return operation;}};
  class Clock extends Date {constructor(value?:any){super(value ?? now);} static now(){return now;}}
  const stops=loadModule<typeof import("../src/lib/classroom/server/recording-stop")>("src/lib/classroom/server/recording-stop.ts",{
    "server-only":{},"node:crypto":crypto,"@/lib/db":{prisma},"./provider-factory":{getRecordingProvider:()=>provider},"../recording-stop-state":stopState,
  },{Date:Clock,console:{error:()=>{}}});
  const api=loadModule<typeof import("../src/lib/classroom/server/recording-orchestrator")>("src/lib/classroom/server/recording-orchestrator.ts",{
    "server-only":{},"@/lib/classroom/config":{},"@/lib/classroom/recording-continuity":{},"@/lib/classroom/recording-provider-state":{appendRecordingProviderState:(base:any,key:string,value:any)=>({...base,[key]:value})},
    "@/lib/classroom/server/provider-factory":{getRecordingProvider:()=>provider},"@/lib/classroom/server/recorder-token":{createRecorderPageUrl:async()=>null},"@/lib/course-room":{},"@/lib/course-status":{CourseStatus:{FINISHED:"finished",AFTER_CLASS:"afterClass",CANCELLED:"cancelled"}},
    "@/lib/db":{prisma},"./recording-stop":stops,"../recording-stop-state":stopState,
  },{Date:Clock});
  return {row,provider,stops,api,advance:(ms=301_000)=>{now+=ms;},get calls(){return {stopCalls,queryCalls};}};
}

test("async stop + replay cannot complete or set stoppedAt until provider exit is confirmed",async()=>{
  const f=fixture();await f.api.stopRecordingAttempt(f.row as any);
  assert.equal(f.row.status,"processing");assert.equal(f.row.stoppedAt,null);assert.equal(f.row.playbackObjectKey,"asset.m3u8");
  f.advance();f.provider.query=async()=>({active:false,files:[],playbackObjectKey:null,providerState:{serverResponse:{status:8}}});
  await f.api.reconcileRecordingAttempt("recording");assert.equal(f.row.status,"completed");assert(f.row.stoppedAt);
});
test("processing task that remains active is queried then receives another bounded same-SID stop",async()=>{
  const f=fixture({status:"processing",stopRequestedAt:new Date(1)});
  await f.api.reconcileRecordingAttempt("recording");f.advance();await f.api.reconcileRecordingAttempt("recording");
  f.advance();await f.api.reconcileRecordingAttempt("recording");assert(f.calls.stopCalls>=1);assert(f.calls.queryCalls>=1);assert.notEqual(f.row.status,"completed");
});
test("old three-failure rows remain eligible for reconciliation",async()=>{
  const f=fixture({status:"failed",failureStage:"stop",stopRetryCount:3,stopRequestedAt:new Date(1)});
  await f.api.reconcilePendingRecordings();assert.equal(f.calls.queryCalls,1);
  f.advance();await f.api.reconcileRecordingAttempt("recording");assert.equal(f.calls.stopCalls,1);assert.notEqual(f.row.status,"failed");
});
test("repeated and concurrent cron/queue calls do not erase leases or duplicate stop",async()=>{
  const f=fixture();let release!:()=>void;
  f.provider.stop=async()=>new Promise(resolve=>{release=()=>resolve({files:[],playbackObjectKey:null,providerState:{serverResponse:{status:6}}});});
  await f.stops.queueDurableRecordingStop("recording");const running=f.stops.reconcileDurableRecordingStop("recording");
  while(!release) await new Promise(resolve=>setImmediate(resolve));
  const lease=f.row.providerState.stopControl.leaseId;
  await Promise.all([f.stops.queueDurableRecordingStop("recording"),f.stops.reconcileDurableRecordingStop("recording")]);
  assert.equal(f.row.providerState.stopControl.leaseId,lease);assert.equal(f.row.providerState.stopControl.stopAttempts,1);
  release();await running;
});
test("timeouts and 404 never prove exit; finite query budget retains attention state",async()=>{
  const f=fixture();f.provider.stop=async()=>{throw Error("504 stop timeout");};f.provider.query=async()=>{throw Error("404 temporary worker missing");};
  await f.api.stopRecordingAttempt(f.row as any);
  for(let i=0;i<40;i++){f.advance();await f.api.reconcileRecordingAttempt("recording");}
  assert.equal(f.row.status,"processing");assert.equal(f.row.stoppedAt,null);
  assert.equal(f.row.providerState.stopControl.queryAttempts,stopState.RECORDING_QUERY_LIMIT);
  assert(f.row.providerState.stopControl.attention);assert(f.row.stopRequestedAt);
});
test("status6/7 and stale/error query payload are not terminal even with a replay",async()=>{
  for(const providerState of [{serverResponse:{status:6}},{serverResponse:{status:7}},{serverResponse:{status:8},queryVerified:false}]) {
    const f=fixture();await f.api.stopRecordingAttempt(f.row as any);f.advance();
    f.provider.query=async()=>({active:false,files:[],playbackObjectKey:"asset",providerState});
    await f.api.reconcileRecordingAttempt("recording");assert.notEqual(f.row.status,"completed");assert.equal(f.row.stoppedAt,null);
  }
});
test("no provider SID is completed only with proof that start was never dispatched",async()=>{
  for(const startDispatch of ["not_dispatched","dispatching",undefined]) {
    const f=fixture({status:"starting",resourceId:null,providerSessionId:null,providerState:{startDispatch}});
    await f.api.stopRecordingAttempt(f.row as any);
    assert.equal(f.row.status,startDispatch === "not_dispatched" ? "completed" : "processing");
    if(startDispatch !== "not_dispatched") assert(f.row.providerState.stopControl.attention);
  }
});
test("scheduled-ended session stops recording from the server without a browser",async()=>{
  const f=fixture({session:{status:"finished"}});await f.api.reconcileRecordingAttempt("recording");
  assert.equal(f.calls.stopCalls,1);assert(f.row.stopRequestedAt);assert.equal(f.row.stoppedAt,null);
});
test("confirmed empty-room default, multi-device, explicit leave, reconnect and heartbeat expiry",()=>{
  assert.equal(classroomEmptyGraceMs(undefined),180_000);assert.equal(classroomEmptyGraceMs("0"),0);
  const now=1_800_000_000_000;
  assert.equal(classroomEmptySince([],now),null);
  assert.equal(classroomEmptySince([{lastSeenAt:new Date(now-1_000),leftAt:null}],now),null);
  const left={lastSeenAt:new Date(now-400_000),leftAt:new Date(now-181_000)};
  assert.equal(classroomEmptySince([left],now),now-181_000);
  assert.equal(classroomEmptySince([left,{lastSeenAt:new Date(now),leftAt:null}],now),null);
  assert.equal(classroomEmptySince([{lastSeenAt:new Date(now-CLASSROOM_RECONNECT_WINDOW_MS-180_000),leftAt:null}],now),now-180_000);
});

test("stop during provider startup retains the late SID durably before cleanup",async()=>{
  const f=fixture({status:"starting",mode:"mix",resourceId:null,providerSessionId:null,providerState:{startDispatch:"not_dispatched"}});
  let release!:()=>void;
  (f.provider as any).start=async()=>new Promise(resolve=>{release=()=>resolve({resourceId:"late-resource",providerSessionId:"late-sid",recorderUserId:"late-recorder",mode:"mix",providerState:{mode:"mix"}});});
  const starting=f.api.processRecordingStart("recording");
  while(!release) await new Promise(resolve=>setImmediate(resolve));
  await f.api.stopRecordingAttempt(f.row as any);
  assert.equal(f.row.status,"processing");assert(f.row.providerState.stopControl.attention);
  release();await starting;
  assert.equal(f.row.providerSessionId,"late-sid");assert.equal(f.row.resourceId,"late-resource");
  assert.equal(f.calls.stopCalls,1);assert.equal(f.row.status,"processing");assert.equal(f.row.stoppedAt,null);
});
test("provider abnormal exit is terminal but an ordinary stop response is only acceptance",async()=>{
 const f=fixture();await f.api.stopRecordingAttempt(f.row as any);f.advance();
 f.provider.query=async()=>({active:false,files:[],playbackObjectKey:null,providerState:{serverResponse:{status:20}}});
 await f.api.reconcileRecordingAttempt("recording");assert.equal(f.row.status,"completed");assert(f.row.providerState.stopControl.confirmedAt);
});
test("a legacy completed row with a stop marker is reverified rather than trusting its file",async()=>{
 const f=fixture({status:"completed",stopRequestedAt:new Date(1),stoppedAt:new Date(1),playbackObjectKey:"old-asset"});
 await f.api.reconcileRecordingAttempt("recording");assert.equal(f.calls.queryCalls,1);assert.equal(f.row.status,"processing");assert.equal(f.row.stoppedAt,null);
 f.advance();await f.api.reconcileRecordingAttempt("recording");assert.equal(f.calls.stopCalls,1);
});
test("only an explicit teacher stop action rearms an exhausted verification budget",async()=>{
 const f=fixture({status:"processing",stopRequestedAt:new Date(1),providerState:{stopControl:{...stopState.newRecordingStopControl(6),queryAttempts:24,attention:"verify"}}});
 await f.api.reconcileRecordingAttempt("recording");assert.deepEqual(f.calls,{stopCalls:0,queryCalls:0});
 await f.api.requestRecordingStop(f.row as any,true);await f.api.processRecordingStop("recording");
 assert.equal(f.calls.queryCalls,1);assert.equal(f.row.providerState.stopControl.queryAttempts,1);
});
