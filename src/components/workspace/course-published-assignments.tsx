"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {FileText} from "lucide-react";
import {workspaceRequest} from "@/lib/workspace-client";
import {enqueueCourseUnitRead} from "@/lib/course-unit-read-queue";
import {watchWorkspaceRefresh} from "@/lib/workspace-refresh";
import {Dialog,DialogContent,DialogDescription,DialogTitle} from "@/components/ui/dialog";
import {CourseAssignmentResponses} from "./course-assignment-responses";
import {courseWorkspaceText as text} from "./course-workspace-copy";
import styles from "./course-workspace.module.css";

type Assignment={id:string;title:string;description:string;dueDate:string|null;publishedAt:string};
export function CoursePublishedAssignments({courseId,programId,unitId,locale}:{courseId:string;programId:string|null;unitId:string|null;locale:string}){
 const [items,setItems]=useState<Assignment[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[selected,setSelected]=useState<Assignment|null>(null),[responseBusy,setResponseBusy]=useState(false),[responseDirty,setResponseDirty]=useState(false);
 const serial=useRef(0),controller=useRef<AbortController|null>(null);
 const load=useCallback(async(silent=false)=>{controller.current?.abort();const current=new AbortController();controller.current=current;const generation=++serial.current;if(!silent)setLoading(true);try{
  const rows=await enqueueCourseUnitRead(current.signal,async()=>{const result:Assignment[]=[],seen=new Set<string>();let cursor:string|null=null;do{const query=new URLSearchParams();if(programId)query.set("programId",programId);query.set("unitId",unitId||"__default__");if(cursor)query.set("cursor",cursor);const page:{assignments:Assignment[];nextCursor:string|null}=await workspaceRequest(`/api/courses/${encodeURIComponent(courseId)}/published-assignments?${query}`,{signal:current.signal});result.push(...page.assignments);cursor=page.nextCursor;if(cursor&&seen.has(cursor))throw new Error("Repeated cursor");if(cursor)seen.add(cursor);}while(cursor);return result;});
  if(generation===serial.current){setItems(rows);setError(false);}
 }catch(failure){if(generation===serial.current){const status=(failure as {status?:number})?.status;if(status===401||status===403||status===404)setItems([]);setError(true);}}finally{if(generation===serial.current)setLoading(false);}},[courseId,programId,unitId]);
 useEffect(()=>{let active=true;const marker=serial;queueMicrotask(()=>{if(active)void load();});return()=>{active=false;marker.current++;controller.current?.abort();};},[load]);
 useEffect(()=>watchWorkspaceRefresh(()=>{if(!selected)void load(true);}),[load,selected]);
 useEffect(()=>{
  if(!selected||(!responseDirty&&!responseBusy))return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
  window.addEventListener("beforeunload",warn);
  return()=>window.removeEventListener("beforeunload",warn);
 },[selected,responseDirty,responseBusy]);
 return <section className={styles.drafts} aria-label={text(locale,"已发布作业","Published assignments")}><header><h2>{text(locale,"已发布作业","Published assignments")}</h2></header>
  {loading&&<p className={styles.subtle} role="status">{text(locale,"正在加载作业…","Loading assignments…")}</p>}{error&&<div className={styles.error} role="alert">{text(locale,"作业加载失败","Unable to load assignments")}<button type="button" onClick={()=>void load()}>{text(locale,"重试","Retry")}</button></div>}
  {!loading&&!error&&!items.length&&<p className={styles.subtle}>{text(locale,"暂无已发布作业","No published assignments")}</p>}
  <div className={styles.lessons}>{items.map(item=><article key={item.id}><span className={styles.lessonIcon}><FileText size={16}/></span><div className={styles.lessonText}><strong>{item.title}</strong><small>{text(locale,"已发布","Published")}{item.dueDate&&` · ${text(locale,"截止","Due")} ${item.dueDate}`}</small></div><button type="button" aria-label={`${text(locale,"查看作业","View assignment")} ${item.title}`} onClick={()=>{serial.current++;controller.current?.abort();setLoading(false);setSelected(item);}}>{text(locale,"查看","View")}</button></article>)}</div>
  <Dialog open={selected!==null} onOpenChange={open=>{if(!open&&!responseBusy&&(!responseDirty||window.confirm(text(locale,"当前编辑尚未保存，关闭后内容将丢失。确定关闭吗？","Your changes are not saved. Close and discard them?")))){setResponseDirty(false);setSelected(null);void load(true);}}}><DialogContent className={styles.dialog}><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>{selected?.dueDate?`${text(locale,"截止日期","Due date")}: ${selected.dueDate}`:text(locale,"已发布作业","Published assignments")}</DialogDescription><p className={styles.assignmentDescription}>{selected?.description||text(locale,"暂无作业说明","No instructions provided.")}</p>{selected&&<CourseAssignmentResponses key={selected.id} courseId={courseId} assignmentId={selected.id} locale={locale} onBusy={setResponseBusy} onDirtyChange={setResponseDirty}/>}</DialogContent></Dialog>
 </section>;
}
