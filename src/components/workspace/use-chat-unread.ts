"use client";
import {useCallback,useEffect,useState} from "react";
import {workspaceRequest} from "@/lib/workspace-client";
import {workspaceAccessDenied} from "@/lib/workspace-load-results";
import {workspaceUnreadScope,workspaceUnreadForScope} from "@/lib/workspace-chat-unread-scope";

export type ChatPreview={content:string;createdAt:string};
export const CHAT_READ_EVENT="workspace:chat-read";
export function useChatUnread(courseIds:string[]){
 const [state,setState]=useState<{scope:string;counts:Record<string,number>;previews:Record<string,ChatPreview|null>}>({scope:"",counts:{},previews:{}});
 const key=workspaceUnreadScope(courseIds);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const ids=JSON.parse(key) as string[],updated:Record<string,number>={},previews:Record<string,ChatPreview|null>={};
  for(let index=0;index<ids.length;index+=10){
   const batch=ids.slice(index,index+10);
   const result=await workspaceRequest<{counts:Record<string,number>;previews?:Record<string,ChatPreview|null>}>("/api/workspace/chat/unread",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({courseIds:batch}),signal});
   if(signal?.aborted)return;
   // An omitted course was checked by the server and is no longer accessible.
   // Remove its cached data now, even if a later batch fails transiently.
   const revoked=batch.filter(id=>!Object.hasOwn(result.counts,id));
   if(revoked.length)setState(current=>{
    if(current.scope!==key)return current;
    const counts={...current.counts},cached={...current.previews};
    for(const id of revoked){delete counts[id];delete cached[id];}
    return {...current,counts,previews:cached};
   });
   Object.assign(updated,result.counts);Object.assign(previews,result.previews||{});
  }
  setState({scope:key,counts:updated,previews});
 },[key]);
 useEffect(()=>{const controller=new AbortController();let busy=false,queued=false;
  const sync=()=>{if(document.visibilityState==="hidden")return;if(busy){queued=true;return;}busy=true;void refresh(controller.signal).catch(failure=>{if(!controller.signal.aborted&&workspaceAccessDenied(failure))setState({scope:key,counts:{},previews:{}});}).finally(()=>{busy=false;if(queued&&!controller.signal.aborted){queued=false;sync();}});};
  sync();const timer=setInterval(sync,20_000);window.addEventListener(CHAT_READ_EVENT,sync);window.addEventListener("online",sync);window.addEventListener("focus",sync);document.addEventListener("visibilitychange",sync);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener(CHAT_READ_EVENT,sync);window.removeEventListener("online",sync);window.removeEventListener("focus",sync);document.removeEventListener("visibilitychange",sync);};
 },[refresh,key]);
 return {counts:workspaceUnreadForScope(state,key),previews:state.scope===key?state.previews:{}};
}
