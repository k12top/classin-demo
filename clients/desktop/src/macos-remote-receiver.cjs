'use strict';
const {sharedDisplayStillMatches}=require('./share-display.cjs');
const {createRemoteControlFence}=require('./remote-control-fence.cjs');
const {createReceiverLease}=require('./remote-control-receiver-lease.cjs');
const {launchMacRemoteAdapter}=require('./macos-remote-adapter.cjs');
const fields=['grantId','sessionId','teacherId','teacherClientId','shareClaimId'];
const monotonic=()=>Number(process.hrtime.bigint()/1000000n);
/** Main-process only. `readLease` must use the authenticated session. */
async function startNativeRemoteReceiver({binding,display,getDisplays,readLease,executable,signal,launch=launchMacRemoteAdapter,onClose=()=>{}}){
 const matchesDisplay=()=>{try{return sharedDisplayStillMatches(display,getDisplays());}catch{return false;}};
 if(!binding||fields.some(key=>typeof binding[key]!=='string'||!binding[key])||typeof getDisplays!=='function'||typeof readLease!=='function'||!signal||signal.aborted||!matchesDisplay())throw Error('Remote control unavailable');
 const leaseFields=[...fields,...(binding.publicKey!==undefined?['publicKey']:[])];
 binding=Object.freeze(Object.fromEntries(leaseFields.map(key=>[key,binding[key]])));
 display=Object.freeze({...display,bounds:Object.freeze({...display.bounds})});
 // No helper is started until the server has confirmed the exact grant.
 const started=monotonic(),initial=await readLease(binding,AbortSignal.any([signal,AbortSignal.timeout(1800)])),elapsed=monotonic()-started;
 if(signal.aborted||!initial||leaseFields.some(key=>initial[key]!==binding[key])||!Number.isFinite(initial.leaseMs)||initial.leaseMs<=elapsed||initial.leaseMs>2000||!matchesDisplay())throw Error('Remote control unavailable');
 let closed=false,lease,fence,adapter,rejectLeaseReady;
 const close=reason=>{if(closed)return;closed=true;signal.removeEventListener('abort',abort);lease?.close(reason);fence?.close(reason);adapter?.close();rejectLeaseReady?.(Error('Remote control unavailable'));onClose(reason);};
 const abort=()=>close('aborted');signal.addEventListener('abort',abort,{once:true});
 try{
  adapter=launch({executable,displayId:display.id,onClose:reason=>close(reason)});
  await adapter.ready;
  if(closed||signal.aborted||!matchesDisplay())throw Error('Remote control unavailable');
  fence=createRemoteControlFence({grantId:binding.grantId,shareClaimId:binding.shareClaimId,adapter,onClose:reason=>close(reason)});
  const guardedFence={close:reason=>close(reason),renew:(ids,ms)=>{
   if(closed||signal.aborted||!matchesDisplay()){close('display-changed');return false;}
   if(!fence.renew(ids,ms))return false;
   try{adapter.renew();return true;}catch{close('helper-error');return false;}
  }};
  const leaseReady=new Promise((resolve,reject)=>{rejectLeaseReady=reject;lease=createReceiverLease({binding,readLease,fence:guardedFence,onClose:reason=>close(reason),onRenew:()=>{rejectLeaseReady=undefined;resolve();}});});
  lease.start();
  await leaseReady;
  return {receive:packet=>{if(closed)return false;if(!matchesDisplay()){close('display-changed');return false;}return fence.receive(packet);},close,isOpen:()=>!closed&&fence.isOpen()};
 }catch(error){close('startup-failed');throw error;}
}
module.exports={startMacRemoteReceiver:startNativeRemoteReceiver,startNativeRemoteReceiver};
