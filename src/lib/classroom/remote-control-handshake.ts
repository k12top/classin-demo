import {createRemoteInputSigner} from './remote-control-signature';

type Input={sessionId:string;clientId:string;grantId:string;studentId:string;shareClaimId:string;shareAccess?:string;signal:AbortSignal;fetcher?:typeof fetch};
const valid=(value:string)=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
/** Register one nonextractable key per grant; retries always reuse that key. */
export async function prepareRemoteControlSender(input:Input){
 const {sessionId,clientId,grantId,studentId,shareClaimId,shareAccess,signal}=input,fetcher=input.fetcher||fetch;
 if(![sessionId,clientId,grantId,studentId,shareClaimId].every(valid)||signal.aborted)throw Error('Control unavailable');
 const signer=await createRemoteInputSigner({sessionId,grantId,shareClaimId});
 try{
  if(signal.aborted)throw Error('Control unavailable');
  const body=JSON.stringify({action:'register-key',clientId,grantId,publicKey:signer.publicKey,...(shareAccess&&{shareAccess})});
  let lastError:unknown;
  for(let attempt=0;attempt<2;attempt++){
   try{
    const response=await fetcher(`/api/courses/${encodeURIComponent(sessionId)}/classroom/remote-control`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body,signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
    if(!response.ok){if(response.status>=500&&attempt===0)continue;throw Object.assign(new Error('Control unavailable'),{terminal:true});}
    const payload:unknown=await response.json();if(signal.aborted)throw Error('Control unavailable');
    const channel=payload&&typeof payload==='object'&&'channel' in payload?payload.channel:null;
    if(!channel||typeof channel!=='object'||!('grantId' in channel)||channel.grantId!==grantId||!('sessionId' in channel)||channel.sessionId!==sessionId||!('studentId' in channel)||channel.studentId!==studentId||!('shareClaimId' in channel)||channel.shareClaimId!==shareClaimId||!('publicKey' in channel)||channel.publicKey!==signer.publicKey||!('studentSignalingId' in channel)||typeof channel.studentSignalingId!=='string'||!valid(channel.studentSignalingId))throw Object.assign(new Error('Invalid control response'),{terminal:true});
    return {signer,targetSignalingId:channel.studentSignalingId};
   }catch(error){lastError=error;if(signal.aborted||Boolean(error&&typeof error==='object'&&'terminal' in error)||attempt===1)throw error;}
  }
  throw lastError;
 }catch(error){signer.close();throw error;}
}
