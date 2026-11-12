'use strict';

// `readLease` must use the main process's authenticated session and the fixed
// receiver-lease endpoint. A renderer response is never authority to renew.
// The response duration starts no later than the request itself: network and
// server delays therefore consume, rather than extend, the local lease.
function createReceiverLease({binding,readLease,fence,clock={now:()=>Number(process.hrtime.bigint()/1000000n),set:(fn,ms)=>setTimeout(fn,ms),clear:timer=>clearTimeout(timer)},onClose=()=>{},onRenew=()=>{}}){
 const keys=['grantId','sessionId','teacherId','teacherClientId','shareClaimId',...(binding?.publicKey!==undefined?['publicKey']:[])];
 if(!binding||keys.some(key=>typeof binding[key]!=='string'||!binding[key])||typeof readLease!=='function'||typeof fence?.renew!=='function'||typeof fence?.close!=='function')throw Error('Invalid receiver lease');
 binding=Object.freeze(Object.fromEntries(keys.map(key=>[key,binding[key]])));
 let active=false,closed=false,timer,deadlineTimer,controller;
 const close=reason=>{if(closed)return;closed=true;active=false;if(timer!==undefined)clock.clear(timer);if(deadlineTimer!==undefined)clock.clear(deadlineTimer);controller?.abort();fence.close(reason);onClose(reason);};
 const setDeadline=duration=>{if(deadlineTimer!==undefined)clock.clear(deadlineTimer);deadlineTimer=clock.set(()=>close('expired-lease'),duration);};
 const check=async()=>{
  if(!active||closed)return;
  const started=clock.now();controller=new AbortController();
  try{
   const lease=await readLease(binding,controller.signal);
   if(!active||closed)return;
   const ended=clock.now();
   if(!lease||keys.some(key=>lease[key]!==binding[key])||!Number.isFinite(lease.leaseMs)||lease.leaseMs<=0||lease.leaseMs>2000||!Number.isFinite(started)||!Number.isFinite(ended)||ended<started){close('invalid-lease');return;}
   const remaining=lease.leaseMs-(ended-started);
   if(remaining<=0||!fence.renew({grantId:binding.grantId,shareClaimId:binding.shareClaimId},remaining)){close('expired-lease');return;}
   setDeadline(remaining);
   onRenew();
   timer=clock.set(()=>{timer=undefined;void check();},Math.max(1,Math.min(750,Math.floor(remaining/2))));
  }catch{if(!closed)close('lease-unavailable');}
 };
 return {start:()=>{if(active||closed)return false;active=true;setDeadline(2000);void check();return true;},close,isOpen:()=>active&&!closed};
}
module.exports={createReceiverLease};
