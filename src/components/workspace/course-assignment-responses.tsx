"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useAuth} from "@/lib/auth-context";
import {useTimeZone} from "@/lib/use-time-zone";
import {workspaceRequest} from "@/lib/workspace-client";
import {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write";
import {withAssignmentPendingLock,AssignmentPendingBusyError} from "@/lib/course-assignment-pending";
import {submissionPendingKey,parsePendingSubmission,type PendingSubmission} from "@/lib/course-assignment-submission-pending";
import {mergeAssignmentSubmissionPage} from "@/lib/course-assignment-sync";
import {CourseAssignmentReviewForm,reviewLabel,type Review} from "./course-assignment-review";
import {courseWorkspaceText as text} from "./course-workspace-copy";
import styles from "./course-workspace.module.css";

type Submission={id:string;studentId:string;studentName:string;content:string;version:number;updatedAt:string;review:Review|null};
type ResponsePage={canSubmit:boolean;submission?:Submission|null;submissions?:Submission[];nextCursor?:string|null};
// A list-level 404 means the assignment itself no longer exists. A detail-level
// 404 can instead mean only one submission disappeared, so treat it separately.
function assignmentUnavailable(failure:unknown){const status=(failure as {status?:number})?.status;return status===401||status===403||status===404;}
export function CourseAssignmentResponses({courseId,assignmentId,locale,onBusy,onDirtyChange}:{courseId:string;assignmentId:string;locale:string;onBusy:(value:boolean)=>void;onDirtyChange?:(value:boolean)=>void}){
 const {user}=useAuth(),{timeZone}=useTimeZone(),userId=user?.userId||"",key=submissionPendingKey(userId,courseId,assignmentId),path=`/api/courses/${encodeURIComponent(courseId)}/published-assignments/${encodeURIComponent(assignmentId)}/submissions`;
 const [page,setPage]=useState<ResponsePage|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[loadError,setLoadError]=useState<"forbidden"|"failed"|null>(null),[content,setContent]=useState(""),[pending,setPending]=useState<PendingSubmission|null>(null),[busy,setBusy]=useState(false),[discard,setDiscard]=useState(false),[reload,setReload]=useState(0),[moreBusy,setMoreBusy]=useState(false),[conflict,setConflict]=useState(false),[reviewing,setReviewing]=useState<string|null>(null),[reviewBusy,setReviewBusy]=useState(false);
 const [reviewDirty,setReviewDirty]=useState(false),[openingReview,setOpeningReview]=useState<string|null>(null);
 const reviewBusyChange=useCallback((value:boolean)=>{setReviewBusy(value);onBusy(value);},[onBusy]);
 const persisted=useRef(false),holdOpen=useRef(false),silentController=useRef<AbortController|null>(null),reviewController=useRef<AbortController|null>(null);
 useEffect(()=>()=>reviewController.current?.abort(),[]);
 useEffect(()=>{const controller=new AbortController();queueMicrotask(()=>{if(controller.signal.aborted)return;setLoading(true);setError("");setLoadError(null);let saved:PendingSubmission|null=null;try{saved=parsePendingSubmission(localStorage.getItem(key));}catch{/* Storage is optional. */}persisted.current=Boolean(saved);if(saved){setPending(saved);setContent(saved.content);}void workspaceRequest<ResponsePage>(path,{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;setPage(value);if(!saved)setContent(value.submission?.content||"");}).catch(failure=>{if(!controller.signal.aborted){const forbidden=assignmentUnavailable(failure);if(forbidden)setPage(null);setLoadError(forbidden?"forbidden":"failed");}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});});return()=>controller.abort();},[key,path,reload]);
 const clear=useCallback((item:PendingSubmission)=>{try{const current=parsePendingSubmission(localStorage.getItem(key));if(current?.requestId===item.requestId)localStorage.removeItem(key);}catch{/* Storage is optional. */}},[key]);
 const send=async()=>{if(busy||conflict||!page?.canSubmit||(!pending&&!content.trim()))return;let item=pending||{requestId:crypto.randomUUID(),content:content.trim(),expectedVersion:page.submission?.version??null};setBusy(true);onBusy(true);setError("");try{
  const result=await withAssignmentPendingLock(navigator.locks,key,async()=>{
   try{const other=parsePendingSubmission(localStorage.getItem(key));if(other&&other.requestId!==item.requestId){item=other;setPending(other);setContent(other.content);persisted.current=true;return null;}localStorage.setItem(key,JSON.stringify(item));persisted.current=true;holdOpen.current=false;}catch{persisted.current=false;holdOpen.current=true;}
   setPending(item);
   try{const response=await retryIdempotentWrite<{submission:Submission}>(path,"POST",item.requestId,JSON.stringify({content:item.content,expectedVersion:item.expectedVersion}));if(!response.submission)throw new UncertainWriteError();clear(item);setPending(null);holdOpen.current=false;return response.submission;}
   catch(failure){if(!pending&&!(failure instanceof UncertainWriteError)){clear(item);setPending(null);holdOpen.current=false;}throw failure;}
  });
  if(result){setPage({canSubmit:true,submission:result});setContent(result.content);}
 }catch(failure){if(failure instanceof AssignmentPendingBusyError)setError(text(locale,"另一个窗口正在提交，请稍后重试。","Another window is submitting. Try again shortly."));else if(pending||failure instanceof UncertainWriteError)setError(persisted.current?text(locale,"提交结果待确认，请重试；重新打开也可继续。","Submission is awaiting confirmation. Retry or reopen this assignment."):text(locale,"提交结果不确定，请在此窗口重试；关闭前先核对提交记录。","Submission is uncertain. Retry here; check the record before closing."));else{if((failure as {status?:number})?.status===409)setConflict(true);setError(text(locale,"提交失败，作答可能已更新。请复制内容并重新打开后检查。","Unable to submit. Your answer may have changed. Copy your text and reopen to check."));}}finally{setBusy(false);onBusy(holdOpen.current);}};
 const abandon=async()=>{if(!pending||busy)return;setBusy(true);onBusy(true);try{await withAssignmentPendingLock(navigator.locks,key,async()=>clear(pending));holdOpen.current=false;setPending(null);setDiscard(false);setReload(value=>value+1);}catch{setError(text(locale,"另一个窗口正在提交，请稍后重试。","Another window is submitting. Try again shortly."));}finally{setBusy(false);onBusy(holdOpen.current);}};
 const more=async()=>{if(!page?.nextCursor||moreBusy)return;silentController.current?.abort();setMoreBusy(true);try{const next=await workspaceRequest<ResponsePage>(`${path}?cursor=${encodeURIComponent(page.nextCursor)}`);setPage(current=>current?{...current,submissions:[...(current.submissions||[]),...(next.submissions||[])],nextCursor:next.nextCursor}:current);}catch(failure){if(assignmentUnavailable(failure)){setPage(null);setLoadError("forbidden");setError("");}else setError(text(locale,"提交记录加载失败，请重试。","Unable to load submissions. Please retry."));}finally{setMoreBusy(false);}};
 const openReview=async(item:Submission)=>{
  if(openingReview||reviewBusy)return;
  if(reviewDirty&&!window.confirm(text(locale,"当前编辑尚未保存，关闭后内容将丢失。确定关闭吗？","Your changes are not saved. Close and discard them?")))return;
  silentController.current?.abort();setReviewDirty(false);
  if(reviewing===item.id){setReviewing(null);return;}
  setReviewing(null);setError("");setOpeningReview(item.id);const controller=new AbortController();reviewController.current=controller;
  try{const result=await workspaceRequest<{submission:Submission}>(`${path}/${encodeURIComponent(item.id)}`,{signal:controller.signal});if(controller.signal.aborted)return;
   setPage(current=>current?{...current,submissions:current.submissions?.map(value=>value.id===item.id?result.submission:value)}:current);setReviewing(item.id);
  }catch(failure){if(controller.signal.aborted)return;const status=(failure as {status?:number})?.status;if(status===401||status===403){setPage(null);setLoadError("forbidden");}else setError(text(locale,"无法读取最新作答，请重试。","Unable to load the latest answer. Please retry."));}
  finally{if(!controller.signal.aborted){setOpeningReview(null);if(reviewController.current===controller)reviewController.current=null;}}
 };
 const dirty=Boolean(page?.canSubmit&&content!==(page.submission?.content||""));
 useEffect(()=>{onDirtyChange?.((dirty&&!pending)||reviewDirty);return()=>onDirtyChange?.(false);},[dirty,pending,reviewDirty,onDirtyChange]);
 const refreshBlocked=busy||moreBusy||reviewBusy||Boolean(openingReview)||Boolean(reviewing)||Boolean(pending)||dirty;
 useEffect(()=>{
  if(!page||loading||refreshBlocked)return;
  const controller=new AbortController();silentController.current=controller;let inFlight=false;
  const refresh=()=>{
   if(inFlight||document.visibilityState!=="visible"||!navigator.onLine)return;
   inFlight=true;
   void workspaceRequest<ResponsePage>(path,{signal:controller.signal}).then(next=>{
    if(controller.signal.aborted)return;
    if(next.canSubmit!==page.canSubmit){setPage(null);setLoadError("forbidden");return;}
    setPage(next.canSubmit?next:mergeAssignmentSubmissionPage(page,next));
    if(next.canSubmit)setContent(next.submission?.content||"");
    setLoadError(null);
   }).catch(failure=>{if(controller.signal.aborted)return;const forbidden=assignmentUnavailable(failure);if(forbidden)setPage(null);setLoadError(forbidden?"forbidden":"failed");}).finally(()=>{inFlight=false;});
  };
  const timer=window.setInterval(refresh,10_000);
  window.addEventListener("online",refresh);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
  return()=>{controller.abort();if(silentController.current===controller)silentController.current=null;window.clearInterval(timer);window.removeEventListener("online",refresh);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
 },[page,path,loading,refreshBlocked]);
 return <section className={styles.assignmentResponses}><h3>{text(locale,"作答记录","Submissions")}</h3>{page&&<><button type="button" disabled={loading||refreshBlocked} onClick={()=>{silentController.current?.abort();setReload(value=>value+1);}}>{text(locale,"刷新作答记录","Refresh submissions")}</button>{refreshBlocked&&<p>{text(locale,"请先完成或收起当前编辑，再刷新作答记录。","Finish or close the current edit before refreshing submissions.")}</p>}</>}{loading&&<p role="status">{text(locale,"正在加载作答…","Loading submissions…")}</p>}{loadError&&<p role="alert" className={styles.error}>{loadError==="forbidden"?text(locale,"此作业或作答记录当前无法访问。","This assignment or its submissions are no longer available."):text(locale,"提交记录加载失败，请重试。","Unable to load submissions. Please retry.")}{loadError!=="forbidden"&&<button type="button" disabled={loading||refreshBlocked} onClick={()=>{silentController.current?.abort();setReload(value=>value+1);}}>{text(locale,"重试","Retry")}</button>}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  {page?.canSubmit&&<>{page.submission?.review&&<div className={styles.reviewResult}><strong>{reviewLabel(locale,page.submission.review.result)}</strong><p>{page.submission.review.feedback}</p><small>{page.submission.review.reviewerName}</small></div>}<label>{text(locale,"我的作答","My answer")}<textarea rows={5} maxLength={10000} value={content} disabled={loading||busy||Boolean(pending)} onChange={event=>{silentController.current?.abort();setContent(event.target.value);}}/></label>{page.submission&&<p>{text(locale,"已提交","Submitted")} · {new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone}).format(new Date(page.submission.updatedAt))} · {timeZone}</p>}{pending&&<p role="status">{text(locale,"有一条提交待确认。","A submission is awaiting confirmation.")}</p>}{discard&&<p>{text(locale,"原请求可能已经提交，放弃恢复不会撤销作答。","The request may have been submitted; discarding recovery does not undo it.")}</p>}<div className={styles.publicationActions}>{pending?(discard?<><button type="button" disabled={busy} onClick={()=>setDiscard(false)}>{text(locale,"继续恢复","Keep recovery")}</button><button type="button" disabled={busy} onClick={()=>void abandon()}>{text(locale,"放弃恢复","Discard recovery")}</button></>:<><button type="button" disabled={busy} onClick={()=>setDiscard(true)}>{text(locale,"放弃恢复","Discard recovery")}</button><button type="button" className={styles.primary} disabled={busy} onClick={()=>void send()}>{text(locale,"重试确认","Retry to confirm")}</button></>):<button type="button" className={styles.primary} disabled={loading||busy||conflict||!content.trim()||content.trim()===(page.submission?.content||"")} onClick={()=>void send()}>{page.submission?text(locale,"更新作答","Update answer"):text(locale,"提交作答","Submit answer")}</button>}</div></>}
  {page&&!page.canSubmit&&<>{!page.submissions?.length&&<p>{text(locale,"暂无学生作答","No submissions yet")}</p>}{page.submissions?.map(item=><article key={item.id}><strong>{item.studentName}</strong><time>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone}).format(new Date(item.updatedAt))} · {timeZone}</time><p>{item.content}</p>{item.review&&<p>{reviewLabel(locale,item.review.result)}{item.review.submissionVersion!==item.version&&` · ${text(locale,"作答已更新","Answer updated")}`}</p>}<button type="button" disabled={loading||moreBusy||reviewBusy||Boolean(openingReview)} onClick={()=>void openReview(item)}>{openingReview===item.id?text(locale,"正在读取最新作答…","Loading latest answer…"):reviewing===item.id?text(locale,"收起批改","Close review"):text(locale,"批改","Review")}</button>{reviewing===item.id&&<CourseAssignmentReviewForm courseId={courseId} assignmentId={assignmentId} submissionId={item.id} submissionVersion={item.version} review={item.review} locale={locale} onBusy={reviewBusyChange} onDirtyChange={setReviewDirty} onSaved={()=>{setReviewDirty(false);setReviewing(null);setReload(value=>value+1);}}/>}</article>)}{page.nextCursor&&<button type="button" disabled={loading||moreBusy||Boolean(openingReview)} onClick={()=>void more()}>{text(locale,"加载更多","Load more")}</button>}</>}
 </section>;
}
