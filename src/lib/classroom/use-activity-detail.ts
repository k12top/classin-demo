"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClassroomSyncTask, useClassroomJsonRead, useActivityVersionWatch } from './use-classroom-sync';
import { ACTIVITY_REFRESH_EVENT, answersMatch, mergeActivityAnswer, mergeActivitySnapshot, type ActivityAnswers, type ActivityDetail, type ActivityMutationResult } from './activities';

export function activityUrl(sessionId: string, id?: string, shareAccess?: string | null) {
  return `/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities${id?'/'+encodeURIComponent(id):''}${shareAccess?'?shareAccess='+encodeURIComponent(shareAccess):''}`;
}
export function replayPreviewActivityUrl(sessionId:string,studentId:string,activityId?:string){
  const params=new URLSearchParams({student:studentId});if(activityId)params.set("activity",activityId);
  return `/api/sessions/${encodeURIComponent(sessionId)}/replay-preview?${params}`;
}
export async function activityRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw signal.reason;
    try {
      const response = await fetch(url, { cache: 'no-store', ...(body ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      const value = await response.json().catch(() => null);
      if (!response.ok) {
        const error = Object.assign(new Error(value?.error || 'Activity request failed'), { status: response.status });
        if (response.status < 500 && response.status !== 408 && response.status !== 429) throw Object.assign(error, { permanent: true });
        throw error;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Invalid activity response');
      const submitted=body && typeof body==='object' && !Array.isArray(body) ? body as {action?:unknown;answers?:unknown} : null;
      if(submitted?.action==='answer'){
        const receipt=value.response,requested=submitted.answers;
        if(!receipt || typeof receipt!=='object' || Array.isArray(receipt) || typeof receipt.id!=='string' || typeof receipt.userId!=='string' || !Number.isSafeInteger(receipt.version) || receipt.version<1 || !receipt.answers || typeof receipt.answers!=='object' || Array.isArray(receipt.answers) || !requested || typeof requested!=='object' || Array.isArray(requested) || !answersMatch(receipt.answers as ActivityAnswers,requested as ActivityAnswers)) throw new Error('Invalid activity response');
      }else if(submitted?.action){
        const expectedId=decodeURIComponent(new URL(url,'http://localhost').pathname.split('/').at(-1)||'');
        if(!expectedId || value.id!==expectedId || submitted.action==='remind' && (!Number.isSafeInteger(value.reminded) || value.reminded<0))throw new Error('Invalid activity response');
      }
      return value;
    } catch (error) {
      failure = error;
      if (signal?.aborted || (error as { permanent?: boolean })?.permanent) throw error;
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  throw failure;
}
export function announceActivity(sessionId: string, revision: number, onChanged?: (revision:number)=>void) {
  window.dispatchEvent(new CustomEvent(ACTIVITY_REFRESH_EVENT,{detail:{sessionId}}));onChanged?.(revision);
}
export function useActivityDetail(sessionId:string,id:string|null|undefined,shareAccess?:string|null,active=true,previewStudentId?:string|null) {
  useActivityVersionWatch(sessionId, shareAccess, active && Boolean(id));
  const scope=JSON.stringify([sessionId,id||null,shareAccess||null,previewStudentId||null]);
  const [state,setState]=useState<{scope:string;detail:ActivityDetail|null;error:boolean;denied:boolean}>({scope:"",detail:null,error:false,denied:false});
  const detail=state.scope===scope?state.detail:null,error=state.scope===scope&&state.error;
  const read=useClassroomJsonRead(sessionId);
  const generation=useRef(0);
  const answerReadKey=useRef("");
  const reload=useCallback(async(signal?:AbortSignal)=>{
    if(!id)return null;const version=++generation.current;
    const base=previewStudentId?replayPreviewActivityUrl(sessionId,previewStudentId,id):activityUrl(sessionId,id,shareAccess);
    const url=answerReadKey.current?`${base}${base.includes('?')?'&':'?'}clientRead=${encodeURIComponent(answerReadKey.current)}`:base;
    try{const next=await read<ActivityDetail>(url,{signal});if(!signal?.aborted&&version===generation.current)setState(previous=>({scope,detail:mergeActivitySnapshot(previous.scope===scope?previous.detail:null,next),error:false,denied:false}));return next;}
    catch(e){if(!signal?.aborted&&version===generation.current){const status=(e as {status?:number})?.status,denied=status===401||status===403||status===404;setState(previous=>({scope,detail:!denied&&previous.scope===scope?previous.detail:null,error:true,denied}));}throw e;}
  },[sessionId,id,shareAccess,read,previewStudentId,scope]);
  const pendingReview=Object.values(detail?.ownResponse?.aiReview||{}).some(review=>review.status==='pending') || detail?.responses.some(response=>Object.values(response.aiReview||{}).some(review=>review.status==='pending')) || detail?.roster?.some(member=>Object.values(member.response?.aiReview||{}).some(review=>review.status==='pending'));
  const settled=detail?.status==='published'||detail?.status==='cancelled';
  useClassroomSyncTask({sessionId,taskKey:`activity:${id}:${shareAccess||''}:${previewStudentId||''}`,topics:['activities','resume'],active:active&&Boolean(id),
    maxRetryMs:8000,
    realtimeMs:pendingReview?5000:settled?null:60000,fallbackMs:pendingReview?5000:settled?null:5000,wakeAt:detail?.status==='active'&&detail.deadlineAt?Date.parse(detail.deadlineAt):undefined,run:signal=>reload(signal)});
  useEffect(()=>()=>{generation.current++;},[reload]);
  const acceptResponse = (result: ActivityMutationResult) => {generation.current++;answerReadKey.current=crypto.randomUUID();setState(old => old.scope===scope?{...old,detail:mergeActivityAnswer(old.detail,result)}:old);};
  return {detail:detail?.id===id?detail:null,error,accessDenied:state.scope===scope&&state.denied,reload,acceptResponse};
}
