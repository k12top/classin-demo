"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useTranslation} from "@/lib/i18n/context";
import {replayPreviewActivityUrl} from "@/lib/classroom/use-activity-detail";
import {useClassroomJsonRead,useClassroomSyncTask} from "@/lib/classroom/use-classroom-sync";
import {replayActivityMarkers} from "@/lib/classroom/replay-activity-markers";
import type {TimedRecording} from "@/lib/classroom/playback-captions";
import type {ActivityOverview} from "@/lib/classroom/activity-overview";
import styles from "./replay-activity-markers.module.css";

export function ReplayActivityMarkers({sessionId,recording,previewStudentId,onSeek}:{sessionId:string;recording:TimedRecording;previewStudentId?:string|null;onSeek:(startedAt:string,id:string)=>void}){
 const {locale}=useTranslation(),zh=locale.startsWith("zh"),tw=locale==="zh-TW",vi=locale.startsWith("vi");
 const scope=JSON.stringify([sessionId,previewStudentId||null]);
 const [result,setResult]=useState<{scope:string;data:ActivityOverview|null;failed:boolean}>({scope:"",data:null,failed:false}),[revision,setRevision]=useState(0);
 const read=useClassroomJsonRead(sessionId),generation=useRef(0);
 const load=useCallback(async(signal?:AbortSignal)=>{const current=++generation.current,url=previewStudentId?replayPreviewActivityUrl(sessionId,previewStudentId):`/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities?overview=1`;
  try{const value=await read<ActivityOverview>(url,{signal});if(!signal?.aborted&&current===generation.current)setResult({scope,data:value,failed:false});}
  catch(error){if(!signal?.aborted&&current===generation.current){const status=(error as {status?:number})?.status,denied=status===401||status===403||status===404;setResult(previous=>({scope,data:!denied&&previous.scope===scope?previous.data:null,failed:true}));}throw error;}
 },[sessionId,previewStudentId,read,scope]);
 useClassroomSyncTask({sessionId,taskKey:`replay-markers:${previewStudentId||""}:${revision}`,topics:["activities","resume"],realtimeMs:30000,fallbackMs:30000,run:load});
 useEffect(()=>()=>{generation.current++;},[load]);
 const markers=replayActivityMarkers(result.scope===scope?result.data?.activities||[]:[],recording);
 const label=zh?(tw?"錄影中的互動":"录像中的互动"):vi?"Tương tác trong video":"Interactions in this recording";
 const notice=result.scope===scope&&result.failed?<div className={styles.notice} role="status">{zh?(tw?"無法載入互動標記。":"无法加载互动标记。"):"Unable to load interaction markers."} <button type="button" onClick={()=>setRevision(value=>value+1)}>{zh?(tw?"重試":"重试"):"Retry"}</button></div>:null;
 if(!markers.length)return notice;
 const time=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds)%60).padStart(2,"0")}`;
 return <section className={styles.markers} aria-label={label}>{notice}<div className={styles.heading}>{label}</div><div className={styles.track}>{markers.map(marker=><button key={marker.id} type="button" style={{left:`${marker.fraction*100}%`}} aria-label={`${time(marker.seconds)} · ${marker.title}`} title={`${time(marker.seconds)} · ${marker.title}`} onClick={()=>onSeek(marker.startedAt,marker.id)} />)}</div><div className={styles.links}>{markers.map(marker=><button key={marker.id} type="button" onClick={()=>onSeek(marker.startedAt,marker.id)}><span>{time(marker.seconds)}</span> {marker.title}</button>)}</div></section>;
}
