"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {workspaceRequest} from "@/lib/workspace-client";
import {createWorkspaceReadQueue} from "@/lib/workspace-request-queue";
import type {ActivityOverviewSummary} from "@/lib/classroom/activity-overview";
import {courseActivitySummaryText,courseWorkspaceText} from "./course-workspace-copy";
import styles from "./course-workspace.module.css";

const enqueueSummary=createWorkspaceReadQueue(3);

/** Only fetch visible rows; each request uses the existing per-lesson access check. */
export function CourseActivitySummary({sessionId,locale}:{sessionId:string;locale:string}){
 const element=useRef<HTMLSpanElement>(null),controller=useRef<AbortController|null>(null);
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
 return <span ref={element} className={styles.activitySummary}>
  {state.status==="ready"?courseActivitySummaryText(locale,state.data)
   : state.status==="error"?<>{courseWorkspaceText(locale,"统计加载失败","Statistics unavailable")} <button type="button" onClick={load}>{courseWorkspaceText(locale,"重试","Retry")}</button></>
   : courseWorkspaceText(locale,"正在加载统计…","Loading statistics…")}
 </span>;
}
