"use client";
import { ClassroomIconButton } from "./icon-button";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Copy, Loader2, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import type { ActivityDefinition, ActivityKind, QuestionKind } from "@/lib/classroom/activities";

type Draft={title:string;kind:ActivityKind;durationSec:number|null;definition:ActivityDefinition};
export function ActivityDraftControls({sessionId,shareAccess,source,kind,type,onApply}:{sessionId:string;shareAccess?:string|null;source:unknown;kind:ActivityKind;type:QuestionKind;onApply:(draft:Draft)=>void}){
 const {t,locale}=useTranslation();const [seed,setSeed]=useState(''),[draft,setDraft]=useState<Draft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function generate(){
  if(busy)return;setBusy(true);setError('');setDraft(null);const controller=new AbortController();request.current=controller;
  try{const content=seed;const response=await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities/draft`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:"generate",seed:content,kind,type,language:locale,shareAccess}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(55000)])});const result=await response.json();if(!response.ok||!result.draft)throw new Error(t('classroomChat.aiUnavailable'));if(!controller.signal.aborted)setDraft(result.draft)}catch{if(!controller.signal.aborted)setError(t('classroomChat.aiUnavailable'))}finally{if(!controller.signal.aborted)setBusy(false)}
 }
 return <details className="classroom-activity-draft"><summary><Sparkles />{t('classroomChat.generate')}</summary><textarea aria-label={t('classroomChat.seed')} placeholder={t('classroomChat.seed')} value={seed} maxLength={4000} rows={3} onChange={event=>setSeed(event.target.value)} disabled={busy}/><div className="classroom-activity-draft-actions"><button type="button" disabled={busy||!seed.trim()} onClick={()=>void generate()}>{busy?<Loader2 className="animate-spin"/>:<Sparkles/>}{t('classroomChat.generate')}</button><ClassroomIconButton type="button" title={t('classroomChat.copy')} aria-label={t('classroomChat.copy')} onClick={()=>{void navigator.clipboard.writeText(JSON.stringify(source,null,2)).then(()=>setCopied(true)).catch(()=>setError(t('classroomChat.copyFailed')))}}>{copied?<Check/>:<Copy/>}</ClassroomIconButton></div>{error&&<p role="alert">{error}</p>}{draft&&<div className="classroom-activity-draft-preview"><strong>{draft.title}</strong>{draft.definition.questions.map(q=><div key={q.id}><p>{q.prompt}</p>{q.options.map(o=><p key={o.id}>{o.text}</p>)}</div>)}<button type="button" onClick={()=>{onApply(draft);setDraft(null)}}><Check/>{t('classroomChat.useDraft')}</button></div>}</details>
}
