/* eslint-disable @typescript-eslint/no-explicit-any -- isolated route boundaries */
import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { loadModule } from "./helpers/load-module";
import * as helpers from "../src/lib/classroom/agora-webhook";
import * as stopState from "../src/lib/classroom/recording-stop-state";

function fixture(eventType:number,sid="sid") {
 const recording:any={id:"recording",providerSessionId:"sid",status:"recording",mode:"web",startedAt:new Date(),providerState:{},playbackObjectKey:null};
 const event:any={id:"event",processedAt:null};let where:any;
 const prisma={classroomProviderEvent:{findUnique:async()=>event,update:async({data}:any)=>Object.assign(event,data)},
  classroomRecording:{findFirst:async(input:any)=>{where=input.where;return input.where.providerSessionId==="sid"?recording:null;},findUniqueOrThrow:async()=>recording,update:async({data}:any)=>Object.assign(recording,data)},$queryRaw:async()=>[],$transaction:async(fn:any)=>fn(prisma)};
 const api=loadModule<typeof import("../src/app/api/webhooks/agora/recording/route")>("src/app/api/webhooks/agora/recording/route.ts",{
  "next/server":{NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},
  "@/lib/classroom/agora-webhook":helpers,"@/lib/classroom/providers/agora/server":{selectAgoraRecordingPlayback:()=>({objectKey:"segment.m3u8",format:"hls"})},
  "@/lib/classroom/recording-provider-state":{appendRecordingProviderState:(base:any,key:string,value:any)=>({...base,[key]:value})},"@/lib/classroom/recording-stop-state":stopState,"@/lib/db":{prisma},
 },{process:{env:{AGORA_RECORDING_WEBHOOK_SECRET:"test-secret"}}});
 const raw=JSON.stringify({noticeId:"notice",eventType,payload:{sid,cname:"shared-channel",details:{fileList:[{fileName:"segment.m3u8"}]}}});
 const request=()=>new Request("https://example.test/webhook",{method:"POST",body:raw,headers:{"agora-signature-v2":createHmac("sha256","test-secret").update(raw).digest("hex")}});
 return {api,recording,event,request,get where(){return where;}};
}
test("file and component-stop events never claim provider task exit",async()=>{for(const type of [4,31,41,71]){const f=fixture(type);await f.api.POST(f.request() as any);assert.equal(f.recording.status,"recording");assert.equal(f.recording.stoppedAt,undefined);assert.equal(f.recording.playbackObjectKey,"segment.m3u8");}});
test("signed exact-SID session_exit confirms provider exit independently of replay",async()=>{const f=fixture(11);await f.api.POST(f.request() as any);assert.equal(f.recording.status,"completed");assert(f.recording.providerState.stopControl.confirmedAt);assert(f.recording.stoppedAt);const response=await f.api.POST(f.request() as any);assert.equal((await response.json()).duplicate,true);});
test("old SID never falls back to newest task sharing channel",async()=>{const f=fixture(11,"old-sid");const response=await f.api.POST(f.request() as any);assert.equal((await response.json()).matched,false);assert.deepEqual(f.where,{provider:"agora",providerSessionId:"old-sid"});assert.equal(f.recording.status,"recording");});
test("invalid webhook signature cannot read or mutate recorder state",async()=>{const f=fixture(11);const response=await f.api.POST(new Request("https://example.test",{method:"POST",body:"{}"}) as any);assert.equal(response.status,401);assert.equal(f.where,undefined);assert.equal(f.recording.status,"recording");});
