'use client';
import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {useClassroomSyncTask} from './use-classroom-sync';
import type {ClassroomRemoteControlHint} from './signaling/types';

export type RemoteControlView={id:string;teacherId:string;studentId:string;shareClaimId:string;state:'requested'|'granted'|'rejected'|'revoked';effectiveState:'requested'|'granted'|'rejected'|'revoked'|'inactive';keyReady:boolean;receiverReady:boolean;requestedAt:string;expiresAt:string};
export type RemoteControlCommand=
 | {action:'request';studentId:string;claimId:string;commandId:string}
 | {action:'respond';grantId:string;accept:boolean;commandId:string}
 | {action:'stop';grantId:string};
type State={scope:string;grants:RemoteControlView[];loaded:boolean;error:boolean};
export class RemoteControlClientError extends Error {constructor(readonly status:number){super('Remote control request failed');}}
function grantList(value:unknown):value is RemoteControlView[]{
 return Array.isArray(value)&&value.length<=100&&value.every(item=>item&&typeof item==='object'&&['id','teacherId','studentId','shareClaimId','requestedAt','expiresAt'].every(key=>typeof item[key]==='string')&&['requested','granted','rejected','revoked'].includes(item.state)&&['requested','granted','rejected','revoked','inactive'].includes(item.effectiveState)&&(item.keyReady===undefined||typeof item.keyReady==='boolean')&&(item.receiverReady===undefined||typeof item.receiverReady==='boolean'));
}
/** The server is authoritative; hints and mutation responses only trigger reads. */
export function useRemoteControl(input:{sessionId:string;clientId:string;userId:string;shareAccess?:string;active:boolean;publishHint?:(hint:ClassroomRemoteControlHint)=>Promise<void>}){
 const {sessionId,clientId,userId,shareAccess='',active,publishHint}=input;
 const scope=JSON.stringify([sessionId,clientId,userId,shareAccess]);
 const current=useRef(scope),readGeneration=useRef(0),actionController=useRef<AbortController|null>(null);
 const [state,setState]=useState<State>({scope,grants:[],loaded:false,error:false});
 useLayoutEffect(()=>{const generationRef=readGeneration,controllerRef=actionController;current.current=scope;generationRef.current++;return()=>{generationRef.current++;controllerRef.current?.abort();};},[scope,active]);
 const endpoint=`/api/courses/${encodeURIComponent(sessionId)}/classroom/remote-control`;
 const read=useCallback(async(signal:AbortSignal)=>{
  const generation=readGeneration.current;const query=new URLSearchParams({clientId});if(shareAccess)query.set('shareAccess',shareAccess);
  try{
   const response=await fetch(`${endpoint}?${query}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15_000)])});
   if(!response.ok){if(!signal.aborted&&current.current===scope&&generation===readGeneration.current&&[401,403,404].includes(response.status))setState({scope,grants:[],loaded:false,error:true});throw new RemoteControlClientError(response.status);}
   const body:unknown=await response.json();if(!body||typeof body!=='object'||!('grants' in body)||!grantList(body.grants))throw new Error('Invalid remote control response');
   if(!signal.aborted&&current.current===scope&&generation===readGeneration.current)setState({scope,grants:body.grants,loaded:true,error:false});
  }catch(error){if(!signal.aborted&&current.current===scope&&generation===readGeneration.current)setState(previous=>previous.scope===scope?{...previous,error:true}:{scope,grants:[],loaded:false,error:true});throw error;}
 },[clientId,endpoint,scope,shareAccess]);
 // Sharing can hide the classroom window; authorization changes must still
 // be observed while that window is in the background.
 const sync=useClassroomSyncTask({sessionId,taskKey:`remote-control:${scope}`,topics:['remote-control'],run:read,active:active&&Boolean(sessionId&&clientId&&userId),realtimeMs:15_000,fallbackMs:5_000,background:true});
 const command=useCallback(async(action:RemoteControlCommand)=>{
  if(!active||current.current!==scope||actionController.current)throw new RemoteControlClientError(409);
  const controller=new AbortController();actionController.current=controller;readGeneration.current++;
  if(action.action==='stop')setState(previous=>previous.scope===scope?{...previous,grants:previous.grants.filter(grant=>grant.id!==action.grantId)}:previous);
  try{
   const send=()=>fetch(endpoint,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({...action,clientId,...(shareAccess&&{shareAccess})}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15_000)])});
   let result:Response,retried=false;
   try{result=await send();}catch(error){if(action.action!=='stop'||controller.signal.aborted)throw error;retried=true;result=await send();}
   if(action.action==='stop'&&!retried&&[408,429,500,502,503,504].includes(result.status)&&!controller.signal.aborted)result=await send();
   if(!result.ok){if(current.current===scope&&[401,403,404].includes(result.status))setState({scope,grants:[],loaded:false,error:true});throw new RemoteControlClientError(result.status);}
   const body=await result.json() as {grant?:{teacherId?:unknown;studentId?:unknown}};
   if(controller.signal.aborted||current.current!==scope)return;
   readGeneration.current++;sync.scheduler.invalidate('remote-control');
   const grant=body.grant,target=grant?.teacherId===userId?grant.studentId:grant?.studentId===userId?grant.teacherId:null;
   if(typeof target==='string'&&target&&target!==userId&&publishHint)void publishHint({courseId:sessionId,topic:'remote-control-hint',revision:0,actorId:userId,targetUserId:target}).catch(()=>undefined);
  }finally{if(actionController.current===controller)actionController.current=null;if(action.action==='stop'&&!controller.signal.aborted&&current.current===scope)sync.scheduler.invalidate('remote-control');}
 },[active,clientId,endpoint,publishHint,scope,sessionId,shareAccess,sync,userId]);
 return {grants:state.scope===scope&&active?state.grants:[],loaded:state.scope===scope&&active&&state.loaded,error:state.scope===scope&&active&&state.error,command,refresh:()=>sync.scheduler.invalidate('remote-control')};
}
