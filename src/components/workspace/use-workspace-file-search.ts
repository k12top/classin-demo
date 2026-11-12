"use client";
import {useEffect,useMemo,useState} from 'react';
import {workspaceRequest} from '@/lib/workspace-client';
export type WorkspaceSearchFile={id:string;name:string;size:number};
export function useWorkspaceFileSearch(query:string,userId:string,active:boolean){
 const normalized=query.trim(),[attempt,setAttempt]=useState(0);
 // Opening the search again or retrying must revalidate, even with the same text.
 const scope=useMemo(()=>({userId,normalized,active,attempt}),[userId,normalized,active,attempt]);
 const [state,setState]=useState<{scope:typeof scope|null;files:WorkspaceSearchFile[];loading:boolean;error:boolean;hasMore:boolean}>({scope:null,files:[],loading:false,error:false,hasMore:false});
 const enabled=active&&Boolean(userId)&&normalized.length>0&&normalized.length<=100;
 useEffect(()=>{
  if(!enabled)return;const controller=new AbortController();
  const timer=setTimeout(()=>{setState({scope,files:[],loading:true,error:false,hasMore:false});void workspaceRequest<{files:WorkspaceSearchFile[];hasMore:boolean}>(`/api/workspace/drive/search?q=${encodeURIComponent(normalized)}`,{signal:controller.signal}).then(result=>{
   if(!result||!Array.isArray(result.files)||typeof result.hasMore!=='boolean'||!result.files.every(file=>file&&typeof file.id==='string'&&typeof file.name==='string'&&Number.isSafeInteger(file.size)&&file.size>=0))throw Error('Invalid search response');
   if(!controller.signal.aborted)setState({scope,files:result.files,loading:false,error:false,hasMore:result.hasMore});
  }).catch(()=>{if(!controller.signal.aborted)setState({scope,files:[],loading:false,error:true,hasMore:false});});},250);
  return()=>{clearTimeout(timer);controller.abort();};
 },[scope,normalized,enabled,attempt]);
 const current=enabled&&state.scope===scope?state:{scope,files:[],loading:enabled,error:false,hasMore:false};
 return {...current,retry:()=>setAttempt(value=>value+1)};
}
