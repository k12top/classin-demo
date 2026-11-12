"use client";
import {useEffect,useRef,useState} from "react";
import {useAuth} from "@/lib/auth-context";
import {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write";
import {withAssignmentPendingLock,AssignmentPendingBusyError} from "@/lib/course-assignment-pending";
import {reviewPendingKey,parsePendingReview,type PendingReview} from "@/lib/course-assignment-review-pending";
import type {AssignmentReviewResult} from "@/lib/course-assignment-review";
import {courseWorkspaceText as text} from "./course-workspace-copy";
import styles from "./course-workspace.module.css";

export type Review={submissionVersion:number;reviewerName:string;result:AssignmentReviewResult;feedback:string;version:number;updatedAt:string};
export function reviewLabel(locale:string,result:AssignmentReviewResult){return result==="correct"?text(locale,"正确","Correct"):result==="needs_revision"?text(locale,"需修改","Needs revision"):text(locale,"已批阅","Reviewed");}
export function CourseAssignmentReviewForm({courseId,assignmentId,submissionId,submissionVersion,review,locale,onBusy,onDirtyChange,onSaved}:{courseId:string;assignmentId:string;submissionId:string;submissionVersion:number;review:Review|null;locale:string;onBusy:(value:boolean)=>void;onDirtyChange:(value:boolean)=>void;onSaved:()=>void}){
 const {user}=useAuth(),userId=user?.userId||"",key=reviewPendingKey(userId,courseId,assignmentId,submissionId);
 const [result,setResult]=useState<AssignmentReviewResult>(review?.result||"reviewed"),[feedback,setFeedback]=useState(review?.feedback||""),[pending,setPending]=useState<PendingReview|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[discard,setDiscard]=useState(false),[conflict,setConflict]=useState(false);
 const dirty=!pending&&(result!==(review?.result||"reviewed")||feedback!==(review?.feedback||""));
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
 const persisted=useRef(false),holdOpen=useRef(false);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;try{const item=parsePendingReview(localStorage.getItem(key));if(item){persisted.current=true;setPending(item);setResult(item.result);setFeedback(item.feedback);}}catch{/* Storage is optional. */}setReady(true);});return()=>{active=false;};},[key]);
 const clear=(item:PendingReview)=>{try{if(parsePendingReview(localStorage.getItem(key))?.requestId===item.requestId)localStorage.removeItem(key);}catch{/* Storage is optional. */}};
 const send=async()=>{if(!ready||busy||conflict||!userId)return;let item=pending||{requestId:crypto.randomUUID(),submissionVersion,expectedVersion:review?.version??null,result,feedback:feedback.trim()};setBusy(true);onBusy(true);setError("");try{
  const saved=await withAssignmentPendingLock(navigator.locks,key,async()=>{
   try{const existing=parsePendingReview(localStorage.getItem(key));if(existing&&existing.requestId!==item.requestId){item=existing;setPending(item);setResult(item.result);setFeedback(item.feedback);persisted.current=true;return false;}localStorage.setItem(key,JSON.stringify(item));persisted.current=true;holdOpen.current=false;}catch{persisted.current=false;holdOpen.current=true;}
   setPending(item);try{const response=await retryIdempotentWrite<{review:Review}>(`/api/courses/${encodeURIComponent(courseId)}/published-assignments/${encodeURIComponent(assignmentId)}/submissions/${encodeURIComponent(submissionId)}/review`,"POST",item.requestId,JSON.stringify({submissionVersion:item.submissionVersion,expectedVersion:item.expectedVersion,result:item.result,feedback:item.feedback}));if(!response.review)throw new UncertainWriteError();clear(item);setPending(null);holdOpen.current=false;return true;}
   catch(failure){if(!pending&&!(failure instanceof UncertainWriteError)){clear(item);setPending(null);holdOpen.current=false;}throw failure;}
  });if(saved)onSaved();
 }catch(failure){if(failure instanceof AssignmentPendingBusyError)setError(text(locale,"另一个窗口正在批改，请稍后重试。","Another window is reviewing. Try again shortly."));else if(pending||failure instanceof UncertainWriteError)setError(persisted.current?text(locale,"批改结果待确认，请重试或重新打开作业。","Review is awaiting confirmation. Retry or reopen this assignment."):text(locale,"批改结果不确定，请在此窗口重试并核对记录。","Review is uncertain. Retry here and check the record."));else{if((failure as {status?:number})?.status===409)setConflict(true);setError(text(locale,"作答或批改已更改，请复制评语并重新打开后检查。","The answer or review changed. Copy your feedback and reopen to check."));}}finally{setBusy(false);onBusy(holdOpen.current);}};
 const abandon=async()=>{if(!pending||busy)return;setBusy(true);onBusy(true);try{await withAssignmentPendingLock(navigator.locks,key,async()=>clear(pending));holdOpen.current=false;setPending(null);setDiscard(false);onSaved();}catch{setError(text(locale,"另一个窗口正在批改，请稍后重试。","Another window is reviewing. Try again shortly."));}finally{setBusy(false);onBusy(holdOpen.current);}};
 return <div className={styles.reviewForm}>
  {review&&review.submissionVersion!==submissionVersion&&<p role="status">{text(locale,"学生已更新作答，之前的批改已过期。","The student updated the answer; the previous review is out of date.")}</p>}
  <label>{text(locale,"批改结果","Review result")}<select value={result} disabled={!ready||busy||Boolean(pending)||conflict} onChange={event=>setResult(event.target.value as AssignmentReviewResult)}><option value="reviewed">{reviewLabel(locale,"reviewed")}</option><option value="correct">{reviewLabel(locale,"correct")}</option><option value="needs_revision">{reviewLabel(locale,"needs_revision")}</option></select></label>
  <label>{text(locale,"评语","Feedback")}<textarea rows={3} maxLength={4000} value={feedback} disabled={!ready||busy||Boolean(pending)||conflict} onChange={event=>setFeedback(event.target.value)}/></label>
  {pending&&<p role="status">{text(locale,"有一条批改待确认。","A review is awaiting confirmation.")}</p>}{discard&&<p>{text(locale,"原请求可能已保存，放弃恢复不会撤销批改。","The review may have been saved; discarding recovery does not undo it.")}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.publicationActions}>{pending?(discard?<><button type="button" disabled={busy} onClick={()=>setDiscard(false)}>{text(locale,"继续恢复","Keep recovery")}</button><button type="button" disabled={busy} onClick={()=>void abandon()}>{text(locale,"放弃恢复","Discard recovery")}</button></>:<><button type="button" disabled={busy} onClick={()=>setDiscard(true)}>{text(locale,"放弃恢复","Discard recovery")}</button><button type="button" className={styles.primary} disabled={busy} onClick={()=>void send()}>{text(locale,"重试确认","Retry to confirm")}</button></>):<button type="button" className={styles.primary} disabled={!ready||busy||conflict} onClick={()=>void send()}>{text(locale,"保存批改","Save review")}</button>}</div>
 </div>;
}
