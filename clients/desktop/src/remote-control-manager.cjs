'use strict';
const {sharedDisplayStillMatches}=require('./share-display.cjs');
const {createSignedRemoteReceiver}=require('./remote-control-signed-receiver.cjs');
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!['.','..'].includes(value)&&!/[\x00-\x1f]/.test(value);
/** All dependencies and all source metadata must be supplied by Electron's main process. */
function createRemoteControlManager({getContext,getSource,getDisplays,readLease,confirm,startReceiver,executable,markReady=async()=>{},revoke=async()=>{},onChange=()=>{},onPointer=()=>{}}){
 if([getContext,getSource,getDisplays,readLease,confirm,startReceiver,executable,markReady,revoke,onChange,onPointer].some(fn=>typeof fn!=='function'))throw Error('Invalid remote control manager');
 let current;
 const stillValid=item=>{try{const context=getContext(item.owner);return current===item&&!item.owner.isDestroyed()&&context?.sessionId===item.sessionId&&getSource(item.owner)===item.source&&sharedDisplayStillMatches(item.source.display,getDisplays());}catch{return false;}};
 const stop=(owner,reason='stopped')=>{
  const item=current;if(!item||(owner&&item.owner!==owner))return false;current=undefined;item.controller.abort();item.receiver?.close(reason);onChange(item.owner,{active:false,reason,grantId:item.grantId});
  void revoke({sessionId:item.sessionId,clientId:item.clientId,grantId:item.grantId}).then(()=>{try{if(!item.owner.isDestroyed()&&getContext(item.owner)?.sessionId===item.sessionId&&!current)onChange(item.owner,{active:false,reason:'revoked',grantId:item.grantId});}catch{/* The classroom may have closed during the request. */}}).catch(()=>{try{if(!item.owner.isDestroyed()&&getContext(item.owner)?.sessionId===item.sessionId&&!current)onChange(item.owner,{active:false,reason:'revoke-failed',grantId:item.grantId});}catch{/* The classroom may have closed during the request. */}});return true;
 };
 async function start(owner,{clientId,grantId}={}){
  if(current||!identifier(clientId)||!identifier(grantId))return false;
  const context=getContext(owner),source=getSource(owner);
  if(!context||!source?.display||!source.id?.startsWith('screen:'))return false;
  const item={owner,sessionId:context.sessionId,source,clientId,grantId,controller:new AbortController(),receiver:null};current=item;
  try{
   if(!stillValid(item))throw Error('Sharing unavailable');
   const reader=readLease(clientId),lease=await reader({sessionId:item.sessionId,grantId},AbortSignal.any([item.controller.signal,AbortSignal.timeout(1800)]));
   if(!stillValid(item)||lease?.grantId!==grantId||lease.sessionId!==item.sessionId||!identifier(lease.teacherId)||!identifier(lease.teacherClientId)||!identifier(lease.shareClaimId)||typeof lease.publicKey!=='string'||!lease.publicKey)throw Error('Authorization unavailable');
   if(!await confirm(owner,lease.teacherId,grantId,source)||!stillValid(item))throw Error('Control declined');
   const binding={sessionId:item.sessionId,grantId,teacherId:lease.teacherId,teacherClientId:lease.teacherClientId,shareClaimId:lease.shareClaimId,publicKey:lease.publicKey};
   const receiver=await startReceiver({binding,display:source.display,getDisplays,readLease:reader,executable:executable(),signal:item.controller.signal,onClose:reason=>{if(current===item)stop(owner,reason);}});
   if(!stillValid(item)){receiver.close('sharing-changed');throw Error('Sharing unavailable');}
   try{item.receiver=createSignedRemoteReceiver({binding,publicKey:lease.publicKey,receiver});}catch(error){receiver.close('invalid-key');throw error;}
   await markReady({sessionId:item.sessionId,clientId:item.clientId,grantId:item.grantId},item.controller.signal);
   if(!stillValid(item))throw Error('Sharing unavailable');
   onChange(owner,{active:true,grantId});return true;
  }catch{if(current===item)stop(owner,'unavailable');return false;}
 }
 function receive(owner,packet){const item=current;if(!item||item.owner!==owner||!item.receiver)return false;if(!stillValid(item)){stop(owner,'sharing-changed');return false;}const accepted=item.receiver.receive(packet);if(accepted&&['move','button','wheel'].includes(packet.event?.type)){try{onPointer(item.source.display,packet.event);}catch{/* A visual indicator must never interrupt input. */}}return accepted;}
 return {start,stop,receive,isActive:owner=>Boolean(current?.owner===owner&&current.receiver),recheck:()=>{if(current&&!stillValid(current))stop(current.owner,'sharing-changed');}};
}
module.exports={createRemoteControlManager};
