"use client";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, ChevronDown, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { ACTIVITY_REFRESH_EVENT, answersMatch, type ActivityAnswers, type ActivityDetail, type ActivitySummary } from "@/lib/classroom/activities";
import styles from "./activity-workspace.module.css";
import { AnswerForm, SavedResponse, type AnswerDraft } from "./activity-workspace";

export function ActivityChatCard({ activity, sessionId, shareAccess, student, onChanged, onManage }: { activity: ActivitySummary; sessionId: string; shareAccess?: string|null; student: boolean; onChanged: (revision:number)=>void; onManage:()=>void }) {
 const {t}=useTranslation();const [open,setOpen]=useState(activity.status==='active'),[detail,setDetail]=useState<ActivityDetail|null>(null),[draft,setDraft]=useState<AnswerDraft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const url=`/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities/${encodeURIComponent(activity.id)}${shareAccess?'?shareAccess='+encodeURIComponent(shareAccess):''}`;
 const reload=useCallback(async(signal?:AbortSignal)=>{const response=await fetch(url,{cache:'no-store',signal});if(!response.ok)throw new Error(t('activities.failed'));const value=await response.json() as ActivityDetail;signal?.throwIfAborted();setDetail(value);return value},[url,t]);
 useEffect(()=>{if(!open)return;const controller=new AbortController();const refresh=()=>{void reload(controller.signal).catch(()=>{if(!controller.signal.aborted)setError(t('activities.loadFailure'))})};refresh();const timer=setInterval(refresh,8000);window.addEventListener(ACTIVITY_REFRESH_EVENT,refresh);return()=>{controller.abort();clearInterval(timer);window.removeEventListener(ACTIVITY_REFRESH_EVENT,refresh)}},[open,reload,t]);
 async function submit(answers:ActivityAnswers,expectedVersion:number){if(busy)return false;setBusy(true);setError('');try{const response=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'answer',answers,expectedVersion,shareAccess})});const result=await response.json();if(!response.ok)throw new Error(result.error||t('activities.failed'));await reload();onChanged(result.revision);window.dispatchEvent(new CustomEvent(ACTIVITY_REFRESH_EVENT,{detail:{sessionId}}));return true}catch(failure){try{const saved=(await reload()).ownResponse;if(saved&&answersMatch(saved.answers,answers))return true}catch{}setError(failure instanceof Error?failure.message:t('activities.failed'));return false}finally{setBusy(false)}}
 return <article className="classroom-chat-activity" data-activity-card={activity.id}><button className="classroom-chat-activity-heading" type="button" onClick={()=>setOpen(!open)} aria-expanded={open}><ClipboardList /><span><strong>{activity.title}</strong><small>{t(`activities.${activity.kind}`)} · {t(`activities.${activity.status}`)} · {t('classroomChat.answered',{count:activity.responseCount})}</small></span><ChevronDown /></button>
  {open&&<div className={`${styles.workspace} ${styles.inline} classroom-chat-activity-body`} data-activity-workspace>{!detail&&!error&&<Loader2 className="animate-spin"/>}{error&&<p role="alert">{error}<button type="button" onClick={()=>{setError('');void reload().catch(()=>setError(t('activities.loadFailure')))}}>{t('activities.retry')}</button></p>}
   {detail&&(student?<><AnswerForm detail={detail} busy={busy} enabled={detail.status==='active'} draft={draft??undefined} onDraft={setDraft} onSubmit={submit}/>{detail.status!=='active'&&detail.ownResponse&&<SavedResponse response={detail.ownResponse} definition={detail.definition}/>}</>:<><p>{detail.definition.questions[0]?.prompt}</p><button type="button" onClick={onManage}>{t('classroomChat.manageActivity')}</button></>)}
  </div>}
 </article>;
}
