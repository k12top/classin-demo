"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_REFRESH_EVENT, type ActivityDetail } from './activities';

export function activityUrl(sessionId: string, id?: string, shareAccess?: string | null) {
  return `/api/sessions/${encodeURIComponent(sessionId)}/classroom/activities${id?'/'+encodeURIComponent(id):''}${shareAccess?'?shareAccess='+encodeURIComponent(shareAccess):''}`;
}
export async function activityRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {cache:'no-store', ...(body ? {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(55000)]):AbortSignal.timeout(55000)});
  const value = await res.json();
  if(!res.ok)throw new Error(value.error || 'Activity request failed');
  return value;
}
export function announceActivity(sessionId: string, revision: number, onChanged?: (revision:number)=>void) {
  window.dispatchEvent(new CustomEvent(ACTIVITY_REFRESH_EVENT,{detail:{sessionId}}));onChanged?.(revision);
}
export function useActivityDetail(sessionId:string,id:string|null|undefined,shareAccess?:string|null) {
  const [detail,setDetail]=useState<ActivityDetail|null>(null),[error,setError]=useState(false);
  const generation=useRef(0);
  const reload=useCallback(async(signal?:AbortSignal)=>{
    if(!id)return null;const version=++generation.current;
    try{const next=await activityRequest<ActivityDetail>(activityUrl(sessionId,id,shareAccess),undefined,signal);if(!signal?.aborted&&version===generation.current){setDetail(next);setError(false);}return next;}
    catch(e){if(!signal?.aborted&&version===generation.current)setError(true);throw e;}
  },[sessionId,id,shareAccess]);
  useEffect(()=>{const controller=new AbortController();let running=false,queued=false;
    const refresh=()=>{if(running){queued=true;return;}running=true;void reload(controller.signal).catch(()=>undefined).finally(()=>{running=false;if(queued&&!controller.signal.aborted){queued=false;refresh();}});};
    const changed=(e:Event)=>{if(!(e instanceof CustomEvent)||!e.detail?.sessionId||e.detail.sessionId===sessionId)refresh();};
    refresh();const timer=setInterval(refresh,3000);window.addEventListener(ACTIVITY_REFRESH_EVENT,changed);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
    // Cleanup invalidates the latest request counter, not a DOM ref snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return()=>{generation.current++;controller.abort();clearInterval(timer);window.removeEventListener(ACTIVITY_REFRESH_EVENT,changed);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[reload,sessionId]);
  return {detail:detail?.id===id?detail:null,error,reload};
}
