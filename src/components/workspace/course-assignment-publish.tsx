"use client";
import {useEffect,useRef,useState} from "react";
import {publicationPendingKey,parsePendingPublication,type PendingPublication} from "@/lib/course-assignment-publication";
import {withAssignmentPendingLock,AssignmentPendingBusyError,assignmentPendingKey,parsePendingAssignment,type AssignmentScope} from "@/lib/course-assignment-pending";
import {workspaceRequest} from "@/lib/workspace-client";
import {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write";
import {courseWorkspaceText as text} from "./course-workspace-copy";
import styles from "./course-workspace.module.css";

/** Publish only the saved version; retries retain the exact request and version. */
export function CourseAssignmentPublish({userId,courseId,draftId,version,scope,locale,disabled,onBusy,onLocked,onPublished}:{userId:string;courseId:string;draftId:string;version:number;scope:AssignmentScope;locale:string;disabled:boolean;onBusy:(busy:boolean)=>void;onLocked:(locked:boolean)=>void;onPublished:()=>void}){
 const key=publicationPendingKey(userId,courseId,draftId),[pending,setPending]=useState<PendingPublication|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[discard,setDiscard]=useState(false),[status,setStatus]=useState<"loading"|"published"|"unpublished"|"error">("loading"),[statusRetry,setStatusRetry]=useState(0),[error,setError]=useState(""),persisted=useRef(false),holdOpen=useRef(false);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;try{const value=parsePendingPublication(localStorage.getItem(key));if(value){persisted.current=true;setPending(value);onLocked(true);}}catch{/* Storage is optional. */}setReady(true);});return()=>{active=false;onLocked(false);};},[key,onLocked]);
 useEffect(()=>{const controller=new AbortController();void workspaceRequest<{published:boolean}>(`/api/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(draftId)}/publish`,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setStatus(result.published?"published":"unpublished");}).catch(()=>{if(!controller.signal.aborted)setStatus("error");});return()=>controller.abort();},[courseId,draftId,statusRetry]);
 const clear=(value:PendingPublication)=>{try{const current=parsePendingPublication(localStorage.getItem(key));if(current?.requestId===value.requestId)localStorage.removeItem(key);}catch{/* Storage is optional. */}};
 const submit=async()=>{if(busy||!ready||(!pending&&(disabled||status!=="unpublished")))return;let item=pending||{requestId:crypto.randomUUID(),version};setBusy(true);onBusy(true);setError("");try{
  const done=await withAssignmentPendingLock(navigator.locks,assignmentPendingKey(scope),async()=>{
   let priorSave=null;try{priorSave=parsePendingAssignment(localStorage.getItem(assignmentPendingKey(scope)),scope);}catch{/* Storage is optional. */}if(priorSave)throw new Error("pending-save");
   return withAssignmentPendingLock(navigator.locks,key,async()=>{
   try{const existing=parsePendingPublication(localStorage.getItem(key));if(existing&&existing.requestId!==item.requestId){item=existing;setPending(item);onLocked(true);persisted.current=true;return false;}localStorage.setItem(key,JSON.stringify(item));persisted.current=true;holdOpen.current=false;}catch{persisted.current=false;holdOpen.current=true;}
   setPending(item);onLocked(true);
   try{await retryIdempotentWrite(`/api/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(draftId)}/publish`,"POST",item.requestId,JSON.stringify({version:item.version}));}
   catch(failure){if(!pending&&!(failure instanceof UncertainWriteError)){clear(item);holdOpen.current=false;setPending(null);onLocked(false);}throw failure;}
   clear(item);holdOpen.current=false;setPending(null);onLocked(false);return true;
   });
  });
  if(done)onPublished();
 }catch(failure){if(failure instanceof Error&&failure.message==="pending-save")setError(text(locale,"草稿有待确认的保存，请先确认后再发布。","Confirm the pending draft save before publishing."));else if(failure instanceof AssignmentPendingBusyError)setError(text(locale,"另一个窗口正在发布，请稍后重试。","Another window is publishing. Try again shortly."));else if(pending||failure instanceof UncertainWriteError)setError(persisted.current?text(locale,"发布结果暂不确定，请重试确认；重新打开草稿也可继续。","Publication is awaiting confirmation. Retry now or reopen this draft."):text(locale,"发布结果暂不确定，请在此窗口重试；关闭前请核对已发布作业。","Publication is uncertain. Retry here; check published assignments before closing."));else setError(text(locale,"无法发布，草稿可能已更改或发布。请关闭并刷新后检查。","Unable to publish. The draft may have changed or already been published. Close and refresh."));}finally{setBusy(false);onBusy(holdOpen.current);}};
 const abandon=async()=>{if(!pending||busy)return;setBusy(true);onBusy(true);try{await withAssignmentPendingLock(navigator.locks,key,async()=>clear(pending));holdOpen.current=false;setPending(null);onLocked(false);setDiscard(false);setConfirm(false);}catch{setError(text(locale,"另一个窗口正在发布，请稍后重试。","Another window is publishing. Try again shortly."));}finally{setBusy(false);onBusy(false);}};
 return <div className={styles.publicationControls}>
  {!pending&&status==="published"&&<p role="status">{text(locale,"已发布此草稿的快照；草稿后续修改不会改变已发布内容。","A snapshot of this draft is published. Later draft edits do not change it.")}</p>}
  {!pending&&status==="error"&&<p role="alert">{text(locale,"无法读取发布状态。","Unable to load publication status.")} <button type="button" onClick={()=>{setStatus("loading");setStatusRetry(value=>value+1);}}>{text(locale,"重试","Retry")}</button></p>}
  {pending&&<p role="status">{text(locale,"有一条发布请求待确认，请重试。","A publication request is awaiting confirmation.")}</p>}
  {confirm&&!pending&&<p>{text(locale,"发布后，有权访问此课程的成员可以查看作业，已加入的学生可以提交作答。","Members with access can view this assignment, and enrolled students can submit answers.")}</p>}
  {discard&&pending&&<p role="status">{text(locale,"原请求可能已发布；放弃恢复不会撤销发布，请先检查已发布作业。","The request may have been published. Discarding recovery does not undo it; check published assignments first.")}</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.publicationActions}>{pending?(discard?<><button type="button" disabled={busy} onClick={()=>setDiscard(false)}>{text(locale,"继续恢复","Keep recovery")}</button><button type="button" disabled={busy} onClick={()=>void abandon()}>{text(locale,"放弃恢复","Discard recovery")}</button></>:<><button type="button" disabled={busy} onClick={()=>setDiscard(true)}>{text(locale,"放弃恢复","Discard recovery")}</button><button type="button" disabled={busy} onClick={()=>void submit()}>{text(locale,"重试确认","Retry to confirm")}</button></>):confirm?<><button type="button" disabled={busy} onClick={()=>setConfirm(false)}>{text(locale,"取消","Cancel")}</button><button type="button" className={styles.primary} disabled={busy||disabled} onClick={()=>void submit()}>{text(locale,"确认发布","Confirm publication")}</button></>:<button type="button" disabled={!ready||busy||disabled||status!=="unpublished"} onClick={()=>setConfirm(true)}>{text(locale,"发布作业","Publish assignment")}</button>}</div>
 </div>;
}
