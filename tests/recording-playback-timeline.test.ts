import test from "node:test";
import assert from "node:assert/strict";
import {recordingPlaybackAssets} from "../src/lib/classroom/recording-playback";
import {recordingFileStartTimes,recordingPlaybackTimings} from "../src/lib/classroom/recording-playback-timeline";
import {appendRecordingProviderState} from "../src/lib/classroom/recording-provider-state";

const start=Date.parse("2026-11-12T00:00:01Z");
const files:Array<{filename?:string;fileName?:string;sliceStartTime:number}>=[{filename:"rec_0.mp4",sliceStartTime:start},{fileName:"rec_1.mp4",sliceStartTime:(start+240_000)/1000}];
const prefix=["recordings","lesson","attempt"];
const base={provider:"agora",mode:"web",createdAt:new Date(start-1000),startedAt:new Date(start+500),stoppedAt:new Date(start+480_000),providerState:{fileNamePrefix:prefix},files};
const assets=recordingPlaybackAssets(files,prefix);
const expected=[{startedAt:new Date(start).toISOString(),stoppedAt:new Date(start+240_000).toISOString()},{startedAt:new Date(start+240_000).toISOString(),stoppedAt:new Date(start+480_000).toISOString()}];
const unknown=[{startedAt:null,stoppedAt:null},{startedAt:null,stoppedAt:null}];

test("web slices normalize seconds and milliseconds against the attempt and preserve numeric asset IDs",()=>{
 assert.deepEqual(recordingPlaybackTimings(base,assets),expected);
 assert.deepEqual(recordingPlaybackTimings({...base,files:[...files,{fileName:assets[0].objectKey,isPlayable:true}]},assets),expected,"untimed storage duplicates do not erase provider evidence");
 assert.deepEqual(assets.map(asset=>asset.objectKey),["recordings/lesson/attempt/rec_0.mp4","recordings/lesson/attempt/rec_1.mp4"]);
});

test("missing, conflicting, out-of-window or non-monotonic metadata does not invent a clip clock",()=>{
 for(const changed of [
  [files[0],{fileName:"rec_1.mp4"}],
  [...files,{fileName:"rec_0.mp4",sliceStartTime:start+1}],
  [files[0],{fileName:"rec_1.mp4",sliceStartTime:0}],
  [files[0],{fileName:"rec_1.mp4",sliceStartTime:start+480_001}],
  [{...files[0],sliceStartTime:start+300_000},{...files[1],sliceStartTime:start+240_000}],
  [{...files[0],sliceStartTime:start},{...files[1],sliceStartTime:start}],
 ])assert.deepEqual(recordingPlaybackTimings({...base,files:changed},assets),unknown);
 assert.deepEqual(recordingPlaybackTimings({...base,stoppedAt:null},assets),unknown);
 assert.deepEqual(recordingPlaybackTimings({...base,createdAt:new Date(start+2)},assets),unknown);
});

test("logical lesson stop caps the last file without guessing from upload timestamps or slice length",()=>{
 const result=recordingPlaybackTimings({...base,stopRequestedAt:new Date(start+400_000)},assets);
 assert.deepEqual(result,[expected[0],{...expected[1],stoppedAt:new Date(start+400_000).toISOString()}]);
 assert.deepEqual(recordingPlaybackTimings({...base,files:files.map(file=>({fileName:file.fileName||file.filename,lastModified:new Date(start).toISOString(),duration:240}))},assets),unknown);
});

test("single legacy clips and edited recordings keep their existing timeline",()=>{
 const one=assets.slice(0,1),legacy=[{startedAt:base.startedAt.toISOString(),stoppedAt:base.stoppedAt.toISOString()}];
 assert.deepEqual(recordingPlaybackTimings({...base,files:[]},one),legacy);
 assert.deepEqual(recordingPlaybackTimings({...base,providerState:{...base.providerState,playbackEdit:{editedObjectKey:"recording-edits/trimmed.mp4"}}},one),legacy);
 assert.deepEqual(recordingPlaybackTimings({...base,mode:"mix"},assets),unknown);
 assert.deepEqual(recordingPlaybackTimings({...base,provider:"other"},assets),unknown);
});

test("file timing survives later provider queries and webhooks that omit their file list",()=>{
 const first=appendRecordingProviderState(base.providerState,"lastWebhook",{payload:{details:{fileList:files}}});
 const second=appendRecordingProviderState(first,"lastWebhook",{eventType:11,payload:{sid:"fixture"}});
 const third=appendRecordingProviderState(second,"lastQuery",{code:404});
 assert.deepEqual(recordingPlaybackTimings({...base,files:assets.map(asset=>({fileName:asset.objectKey,lastModified:"2026-11-12T01:00:00Z"})),providerState:third},assets),expected);
 assert.deepEqual(third.fileNamePrefix,prefix);
 const conflicting=appendRecordingProviderState(third,"lastStop",{serverResponse:{fileList:[{fileName:"rec_0.mp4",sliceStartTime:start+100}]}});
 assert.deepEqual(recordingPlaybackTimings({...base,files:[],providerState:conflicting},assets),unknown);
});

test("the durable timing index excludes private provider fields, paths and unplayable files",()=>{
 const result=recordingFileStartTimes({token:"fixture-private-token",fileList:[...files,{fileName:"../outside.mp4",sliceStartTime:start},{fileName:"denied.mp4",sliceStartTime:start,isPlayable:false},{fileName:"image.jpg",sliceStartTime:start}]},prefix);
 assert.deepEqual(Object.keys(result),assets.map(asset=>asset.objectKey));
 assert.equal(JSON.stringify(result).includes("fixture-private-token"),false);
 const cycle:Record<string,unknown>={fileList:files};cycle.self=cycle;
 assert.deepEqual(recordingFileStartTimes(cycle,prefix),result);
});
