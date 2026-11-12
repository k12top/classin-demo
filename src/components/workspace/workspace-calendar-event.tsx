"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {SchedulingTimeZone,ScheduleTimePreview} from "@/components/time-zone-selector";
import {parseZonedInput,zonedInputValue} from "@/lib/time-zone";
import {workspaceRequest} from "@/lib/workspace-client";
import {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write";
import {pendingEventKey,parsePendingEvent,type PendingEvent} from "@/lib/workspace-event-pending";
import {workspaceCalendarText} from "./workspace-calendar-copy";
import styles from "./workspace.module.css";

export type CalendarEvent={id:string;title:string;notes:string;startsAt:string;endsAt:string;timeZone:string;version:number};
export async function loadCalendarEvents(from:string,to:string,signal:AbortSignal){
 const events:CalendarEvent[]=[],seen=new Set<string>();let cursor:string|null=null;
 do{const query=new URLSearchParams({from,to});if(cursor)query.set("cursor",cursor);
  const result:{events:CalendarEvent[];nextCursor:string|null}=await workspaceRequest(`/api/workspace/events?${query}`,{signal});events.push(...result.events);cursor=result.nextCursor;
  if(cursor&&seen.has(cursor))throw new Error("Repeated event cursor");if(cursor)seen.add(cursor);
 }while(cursor);return events;
}
export function CalendarEventForm({event,day,timeZone,userId,locale,onSaved,onBusyChange,onDirtyChange}:{event?:CalendarEvent;day:string;timeZone:string;userId:string;locale:string;onSaved:()=>void;onBusyChange:(busy:boolean)=>void;onDirtyChange:(dirty:boolean)=>void}){
 const [title,setTitle]=useState(event?.title||""),[notes,setNotes]=useState(event?.notes||""),[zone,setZone]=useState(event?.timeZone||timeZone);
 const [starts,setStarts]=useState(event?zonedInputValue(event.startsAt,event.timeZone):`${day}T09:00`),[ends,setEnds]=useState(event?zonedInputValue(event.endsAt,event.timeZone):`${day}T10:00`);
 const [initial]=useState(()=>({title,notes,zone,starts,ends}));
 const dirty=title!==initial.title||notes!==initial.notes||zone!==initial.zone||starts!==initial.starts||ends!==initial.ends;
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false),[error,setError]=useState(""),[uncertain,setUncertain]=useState(false);
 const pendingBody=useRef<string|null>(null),persisted=useRef(false),storageKey=pendingEventKey(userId);
 const [restored,setRestored]=useState(Boolean(event)),[confirmDiscard,setConfirmDiscard]=useState(false);
 const adopt=useCallback((saved:PendingEvent)=>{pendingBody.current=saved.body;persisted.current=true;setRequestId(saved.requestId);setTitle(saved.input.title);setNotes(saved.input.notes);setZone(saved.input.timeZone as string);setStarts(zonedInputValue(saved.input.startsAt.toISOString(),saved.input.timeZone as string));setEnds(zonedInputValue(saved.input.endsAt.toISOString(),saved.input.timeZone as string));setUncertain(true);setError(workspaceCalendarText(locale,"发现待确认的日程，请重试确认。","A calendar event is awaiting confirmation. Retry to confirm."));},[locale]);
 useEffect(()=>{if(event)return;let active=true;queueMicrotask(()=>{if(!active)return;try{const saved=parsePendingEvent(localStorage.getItem(storageKey));if(saved)adopt(saved);}catch{/* Continue without durable recovery. */}setRestored(true);});return()=>{active=false;};},[event,storageKey,adopt]);
 const clearPending=(body:string)=>{try{const saved=parsePendingEvent(localStorage.getItem(storageKey));if(saved?.requestId===requestId&&saved.body===body)localStorage.removeItem(storageKey);}catch{/* Storage can be unavailable. */}};
 const save=async(action:"save"|"delete")=>{if(busy||!restored)return;
  if(event&&uncertain)return;
  if(action==="delete"&&!window.confirm(workspaceCalendarText(locale,"删除这个个人日程？","Delete this personal event?")))return;
  let sent=false;setBusy(true);onBusyChange(true);setError("");try{
   const path=event?`/api/workspace/events/${encodeURIComponent(event.id)}`:"/api/workspace/events";
   let body=pendingBody.current;
   if(!body && action==="delete")body=JSON.stringify({version:event?.version});
   if(!body){
    if(!title.trim()||title.trim().length>200)throw new Error("event-title-invalid");
    let start:Date,end:Date;try{start=event&&zone===event.timeZone&&starts===initial.starts?new Date(event.startsAt):parseZonedInput(starts,zone);end=event&&zone===event.timeZone&&ends===initial.ends?new Date(event.endsAt):parseZonedInput(ends,zone);}catch{throw new Error("event-time-invalid");}
    const duration=end.getTime()-start.getTime();if(duration<=0||duration>31*86_400_000)throw new Error("event-duration-invalid");
    body=JSON.stringify({title,notes,startsAt:start.toISOString(),endsAt:end.toISOString(),timeZone:zone,...(event?{version:event.version}:{})});
   }
   sent=true;if(event)await workspaceRequest(path,{method:action==="delete"?"DELETE":"PATCH",headers:{"Content-Type":"application/json"},body});
   else {
    const create=async()=>{try{const saved=parsePendingEvent(localStorage.getItem(storageKey));if(saved&&(saved.requestId!==requestId||saved.body!==body)){adopt(saved);return false;}localStorage.setItem(storageKey,JSON.stringify({requestId,body}));persisted.current=true;}catch{persisted.current=false;}
     pendingBody.current=body;try{await retryIdempotentWrite(path,"POST",requestId,body);}catch(error){const code=typeof error==="object"&&error!==null&&"status" in error?Number(error.status):0;if(!uncertain&&code>=400&&code<500&&code!==408&&code!==429)clearPending(body);throw error;}clearPending(body);return true;};
    const created=navigator.locks?await navigator.locks.request(storageKey,{ifAvailable:true},lock=>{if(!lock)throw new Error("event-save-in-progress");return create();}):await create();
    if(!created)return;
   }
   pendingBody.current=null;onSaved();
  }catch(failure){
   const status=typeof failure==="object"&&failure!==null&&"status" in failure?Number(failure.status):0;
   if(failure instanceof Error&&failure.message==="event-save-in-progress"){setError(workspaceCalendarText(locale,"另一个窗口正在保存日程，请稍后重试。","Another window is saving an event. Try again shortly."));return;}
   if(sent&&event&&(status===409||status===404)){setUncertain(true);setError(workspaceCalendarText(locale,"日程已被修改或不再存在，请关闭并查看最新日历。","The event has changed or is no longer available. Close and check the latest calendar."));}
   else if(uncertain||failure instanceof UncertainWriteError||(sent&&event&&(!status||status===408||status===429||status>=500))){setUncertain(true);setError(event?(workspaceCalendarText(locale,"操作结果暂不确定，请关闭并核对日历后再试。","The result is uncertain. Close and check the calendar before trying again.")):persisted.current?(workspaceCalendarText(locale,"保存结果暂不确定，请重试确认；关闭后可重新打开恢复。","The save is uncertain. Retry to confirm; reopen this form to recover it.")):(workspaceCalendarText(locale,"保存结果暂不确定，请在此窗口重试；关闭后请先检查日历。","The save is uncertain. Retry here; check the calendar before creating another.")));}
   else{pendingBody.current=null;if(!event)setRequestId(crypto.randomUUID());
    const code=failure instanceof Error?failure.message:"";
    setError(code==="event-title-invalid"?workspaceCalendarText(locale,"请输入 1 至 200 个字符的日程名称。","Enter a title of 1–200 characters."):
      code==="event-time-invalid"?workspaceCalendarText(locale,"请输入所选时区中的有效日期和时间；夏令时变化可能使该时间不存在。","Enter a valid date and time in the selected time zone. The time may not exist due to a daylight saving change."):
      code==="event-duration-invalid"?workspaceCalendarText(locale,"结束时间必须晚于开始时间，且日程不可超过 31 天。","The end must be after the start and no more than 31 days later."):
      status===401?workspaceCalendarText(locale,"登录已过期，请重新登录后再保存。","Your session has expired. Sign in again before saving."):
      status===403?workspaceCalendarText(locale,"您已没有保存此日程的权限。","You no longer have permission to save this event."):
      status===409?workspaceCalendarText(locale,"此请求与先前的保存冲突，请先检查日历再重试。","This request conflicts with an earlier save. Check the calendar before trying again."):
      workspaceCalendarText(locale,"无法保存日程，请检查内容后重试。","The event could not be saved. Check the details and try again."));}
  }finally{setBusy(false);onBusyChange(false);}
 };
 const discard=async()=>{if(busy)return;setBusy(true);onBusyChange(true);try{const release=()=>{if(pendingBody.current)clearPending(pendingBody.current);onSaved();};if(navigator.locks)await navigator.locks.request(storageKey,{ifAvailable:true},lock=>{if(!lock)throw new Error("busy");release();});else release();}catch{setError(workspaceCalendarText(locale,"另一个窗口正在保存日程，请稍后重试。","Another window is saving an event. Try again shortly."));}finally{setBusy(false);onBusyChange(false);}};
 const submit=(e:FormEvent)=>{e.preventDefault();void save("save");};
 return <form className={styles.form} onSubmit={submit}>
  <label>{workspaceCalendarText(locale,"日程名称","Event title")}<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} disabled={!restored||busy||uncertain}/></label>
  <label>{workspaceCalendarText(locale,"说明","Notes")}<textarea maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)} disabled={!restored||busy||uncertain}/></label>
  <label>{workspaceCalendarText(locale,"日程时区","Event time zone")}{!restored||busy||uncertain?<span>{zone}</span>:<SchedulingTimeZone value={zone} onChange={setZone} localValue={starts}/>}</label>
  <div className={styles.timeFields}><label>{workspaceCalendarText(locale,"开始","Start")}<input type="datetime-local" required value={starts} onChange={e=>setStarts(e.target.value)} disabled={!restored||busy||uncertain}/></label><label>{workspaceCalendarText(locale,"结束","End")}<input type="datetime-local" required value={ends} onChange={e=>setEnds(e.target.value)} disabled={!restored||busy||uncertain}/></label></div>
  <ScheduleTimePreview value={starts} timeZone={zone} knownInstant={event&&zone===event.timeZone&&starts===initial.starts?event.startsAt:undefined}/>{error&&<p className={styles.formError} role="alert">{error}</p>}
  {uncertain&&!event&&confirmDiscard&&<p role="status">{workspaceCalendarText(locale,"原日程可能已经保存。放弃恢复不会删除日程，请先核对日历。","The event may already exist. Discarding recovery will not delete it; check the calendar first.")}</p>}
  <footer>{uncertain&&!event&&(confirmDiscard?<><button type="button" disabled={busy} onClick={()=>setConfirmDiscard(false)}>{workspaceCalendarText(locale,"继续恢复","Keep recovery")}</button><button type="button" disabled={busy} onClick={()=>void discard()}>{workspaceCalendarText(locale,"放弃恢复并关闭","Discard recovery and close")}</button></>:<button type="button" disabled={busy} onClick={()=>setConfirmDiscard(true)}>{workspaceCalendarText(locale,"放弃恢复","Discard recovery")}</button>)}{event&&<button className={styles.button} type="button" disabled={!restored||busy||uncertain} onClick={()=>void save("delete")}>{workspaceCalendarText(locale,"删除","Delete")}</button>}<button className={styles.primary} disabled={!restored||busy||Boolean(event&&uncertain)}>{uncertain&&!event?(workspaceCalendarText(locale,"重试确认","Retry to confirm")):(workspaceCalendarText(locale,"保存","Save"))}</button></footer>
 </form>;
}
