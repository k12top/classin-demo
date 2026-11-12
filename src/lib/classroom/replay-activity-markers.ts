import {captionPosition,type TimedRecording} from "./playback-captions";

export type ReplayMarker = {id:string;title:string;startedAt:string;fraction:number;seconds:number};
/** Do not guess a position when recording timestamps are incomplete. */
export function replayActivityMarkers(activities:readonly {id:string;title:string;startedAt:string|null;status:string}[],recording:TimedRecording|null):ReplayMarker[]{
 if(!recording?.startedAt||!recording.stoppedAt)return [];
 const start=Date.parse(recording.startedAt),end=Date.parse(recording.stoppedAt),duration=end-start;
 if(!Number.isFinite(duration)||duration<=0)return [];
 return activities.flatMap(activity=>{
  if(!activity.startedAt||activity.status==="cancelled")return [];
  const position=captionPosition(activity.startedAt,[recording]);
  return position?[{id:activity.id,title:activity.title,startedAt:activity.startedAt,fraction:position.seconds*1000/duration,seconds:position.seconds}]:[];
 }).sort((a,b)=>a.fraction-b.fraction||a.id.localeCompare(b.id));
}
