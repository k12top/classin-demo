"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClassroomSyncTask, useClassroomJsonRead, useActivityVersionWatch } from './use-classroom-sync';
import { ACTIVITY_REFRESH_EVENT, mergeActivityAnswer, type ActivityDetail, type ActivityMutationResult } from './activities';

export function activityUrl(sessionId: string, id?: string, shareAccess?: string | null) {
  return `/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities${id?'/'+encodeURIComponent(id):''}${shareAccess?'?shareAccess='+encodeURIComponent(shareAccess):''}`;
}
export async function activityRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw signal.reason;
    try {
      const response = await fetch(url, { cache: 'no-store', ...(body ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      const value = await response.json();
      if (!response.ok) {
        const error = new Error(value.error || 'Activity request failed');
        if (response.status < 500 && response.status !== 408 && response.status !== 429) throw Object.assign(error, { permanent: true });
        throw error;
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
export function useActivityDetail(sessionId:string,id:string|null|undefined,shareAccess?:string|null,active=true) {
  useActivityVersionWatch(sessionId, shareAccess, active && Boolean(id));
  const [detail,setDetail]=useState<ActivityDetail|null>(null),[error,setError]=useState(false);
  const read=useClassroomJsonRead(sessionId);
  const generation=useRef(0);
  const reload=useCallback(async(signal?:AbortSignal)=>{
    if(!id)return null;const version=++generation.current;
    try{const next=await read<ActivityDetail>(activityUrl(sessionId,id,shareAccess),{signal});if(!signal?.aborted&&version===generation.current){setDetail(next);setError(false);}return next;}
    catch(e){if(!signal?.aborted&&version===generation.current)setError(true);throw e;}
  },[sessionId,id,shareAccess,read]);
  const pendingReview=Object.values(detail?.ownResponse?.aiReview||{}).some(review=>review.status==='pending') || detail?.responses.some(response=>Object.values(response.aiReview||{}).some(review=>review.status==='pending')) || detail?.roster?.some(member=>Object.values(member.response?.aiReview||{}).some(review=>review.status==='pending'));
  const settled=detail?.status==='published'||detail?.status==='cancelled';
  useClassroomSyncTask({sessionId,taskKey:`activity:${id}:${shareAccess||''}`,topics:['activities','resume'],active:active&&Boolean(id),
    realtimeMs:pendingReview?5000:settled?null:60000,fallbackMs:pendingReview?5000:settled?null:5000,wakeAt:detail?.status==='active'&&detail.deadlineAt?Date.parse(detail.deadlineAt):undefined,run:signal=>reload(signal)});
  useEffect(()=>()=>{generation.current++;},[reload]);
  const acceptResponse = (result: ActivityMutationResult) => setDetail(old => mergeActivityAnswer(old, result));
  return {detail:detail?.id===id?detail:null,error,reload,acceptResponse};
}
