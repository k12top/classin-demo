import {recordingPlaybackAssets,type RecordingPlaybackAsset} from "./recording-playback";

type RecordingTimes = {
 provider:string;
 mode:string;
 createdAt:Date;
 startedAt:Date|null;
 stoppedAt:Date|null;
 stopRequestedAt?:Date|null;
 files?:unknown;
 providerState?:unknown;
};
export type RecordingAssetTimes = {startedAt:string|null;stoppedAt:string|null};

/** Keep file timing evidence when a later query only returns storage objects.
 * Parse only named media files and numeric timestamps; no provider tokens or
 * unrelated response fields are copied to the durable index. */
export function recordingFileStartTimes(value:unknown,prefix:readonly string[]=[]):Record<string,number[]>{
 const values=new Map<string,Set<number>>(),seen=new WeakSet<object>();let visited=0;
 const add=(name:unknown,time:unknown)=>{
  if(typeof name!=="string"||typeof time!=="number"||!Number.isFinite(time))return;
  const asset=recordingPlaybackAssets([{fileName:name}],prefix)[0];if(!asset)return;
  let times=values.get(asset.objectKey);if(!times){if(values.size>=2000)return;times=new Set();values.set(asset.objectKey,times);}
  times.add(time);if(times.size>4){times.clear();times.add(-1);}
 };
 const visit=(node:unknown,depth:number)=>{
  if(!node||typeof node!=="object"||depth>8||visited++>=10000||seen.has(node))return;
  seen.add(node);
  if(Array.isArray(node)){for(const item of node)visit(item,depth+1);return;}
  const record=node as Record<string,unknown>;
  if(record.isPlayable!==false)add(record.fileName||record.filename,record.sliceStartTime);
  if(record.fileStartTimes&&typeof record.fileStartTimes==="object"&&!Array.isArray(record.fileStartTimes)){
   for(const [name,times] of Object.entries(record.fileStartTimes))if(Array.isArray(times))for(const time of times)add(name,time);
  }
  for(const [key,item] of Object.entries(record))if(key!=="fileStartTimes")visit(item,depth+1);
 };
 visit(value,0);return Object.fromEntries([...values].map(([key,times])=>[key,[...times]]));
}

/** Web recorder slices are consecutive. Use their documented file start times,
 * not filename indexes, upload times, or the configured maximum slice length.
 * Older REST responses use seconds; callbacks use milliseconds. Accept a unit
 * only when it places the timestamp unambiguously inside this attempt.
 * https://docs.agora.io/en/realtime-media/cloud-recording/build/handle-events/receive-notifications
 */
export function recordingPlaybackTimings(recording:RecordingTimes,assets:readonly RecordingPlaybackAsset[]):RecordingAssetTimes[]{
 const fallback=assets.map(()=>({startedAt:assets.length===1?recording.startedAt?.toISOString()??null:null,stoppedAt:assets.length===1?recording.stoppedAt?.toISOString()??null:null}));
 const state=recording.providerState&&typeof recording.providerState==="object"&&!Array.isArray(recording.providerState)?recording.providerState as Record<string,unknown>:{};
 // Trimming changes a file's media clock. Original provider metadata must not
 // silently override the edited recording's already adjusted bounds.
 if(recording.provider!=="agora"||state.playbackEdit||assets.length>1&&recording.mode!=="web")return fallback;
 const lower=recording.createdAt?.getTime(),upper=Math.min(recording.stoppedAt?.getTime()??NaN,recording.stopRequestedAt?.getTime()??Infinity);
 if(!Number.isFinite(lower)||!Number.isFinite(upper)||upper<=lower)return fallback;
 const prefix=Array.isArray(state.fileNamePrefix)?state.fileNamePrefix.filter((part):part is string=>typeof part==="string"):[];
 const keys=new Set(assets.map(asset=>asset.objectKey)),starts=new Map<string,number>(),invalid=new Set<string>();
 const evidence=recordingFileStartTimes({files:recording.files,providerState:state},prefix);
 for(const [key,values] of Object.entries(evidence))for(const raw of values){
  if(!keys.has(key))continue;
  const candidates=typeof raw==="number"&&Number.isFinite(raw)&&raw>0?[raw,raw*1000].map(Math.round).filter(time=>time>=lower&&time<upper):[];
  if(candidates.length!==1){invalid.add(key);continue;}
  const start=candidates[0],previous=starts.get(key);
  if(previous!==undefined&&previous!==start)invalid.add(key);
  starts.set(key,start);
 }
 const times=assets.map(asset=>invalid.has(asset.objectKey)?undefined:starts.get(asset.objectKey));
 // Incomplete or conflicting metadata cannot establish the preceding file's
 // end either. Preserve the legacy unknown boundaries instead of guessing.
 if(times.some((time,index)=>time===undefined||index>0&&time<=times[index-1]!))return fallback;
 return times.map((time,index)=>({startedAt:new Date(time!).toISOString(),stoppedAt:new Date(times[index+1]??upper).toISOString()}));
}
