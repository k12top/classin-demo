"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {workspaceRequest} from "@/lib/workspace-client";
import {createWorkspaceReadQueue} from "@/lib/workspace-request-queue";
import type {ActivityOverviewSummary} from "@/lib/classroom/activity-overview";
import styles from "./course-workspace.module.css";

const enqueueSummary=createWorkspaceReadQueue(3);

/** Only fetch visible rows; each request uses the existing per-lesson access check. */
export function CourseActivitySummary({sessionId,locale}:{sessionId:string;locale:string}){
 const zh=locale.startsWith("zh"),element=useRef<HTMLSpanElement>(null),controller=useRef<AbortController|null>(null);
 const [state,setState]=useState<{status:"waiting"|"loading"|"error"}|{status:"ready";data:ActivityOverviewSummary}>({status:"waiting"});
 const load=useCallback(()=>{
  controller.current?.abort();const request=new AbortController();controller.current=request;setState({status:"loading"});
  void enqueueSummary(request.signal,()=>workspaceRequest<ActivityOverviewSummary>(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities?overview=summary`,{signal:request.signal}))
   .then(data=>{if(!request.signal.aborted)setState({status:"ready",data});})
   .catch(()=>{if(!request.signal.aborted)setState({status:"error"});});
 },[sessionId]);
 useEffect(()=>{
  const node=element.current;if(!node)return;
  if(typeof IntersectionObserver==="undefined"){let cancelled=false;queueMicrotask(()=>{if(!cancelled)load();});return()=>{cancelled=true;controller.current?.abort();};}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}},{rootMargin:"150px"});
  observer.observe(node);return()=>{observer.disconnect();controller.current?.abort();};
 },[load]);
 const percent=(value:number|null)=>value===null?"—":`${new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(value)}%`;
 return <span ref={element} className={styles.activitySummary}>
  {state.status==="ready"?(state.data.canManage
   ? <>{zh?`${state.data.participants} 人参与 · 正确率 `:`${state.data.participants} participants · Accuracy `}{percent(state.data.accuracy)}</>
   : <>{zh?`我的作答 ${state.data.submissions} · 正确率 `:`My responses ${state.data.submissions} · Accuracy `}{percent(state.data.accuracy)}</>)
   : state.status==="error"?<>{zh?"统计加载失败":"Statistics unavailable"} <button type="button" onClick={load}>{zh?"重试":"Retry"}</button></>
   : (zh?"正在加载统计…":"Loading statistics…")}
 </span>;
}
