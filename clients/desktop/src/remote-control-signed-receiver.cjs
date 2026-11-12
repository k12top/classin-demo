'use strict';
const {createPublicKey,verify,ECDH}=require('node:crypto');
/** Construct only with a key returned by the authenticated receiver lease. */
function createSignedRemoteReceiver({binding,publicKey,receiver,clock={now:()=>Number(process.hrtime.bigint()/1000000n),set:(fn,ms)=>setTimeout(fn,ms),clear:timer=>clearTimeout(timer)}}){
 if(!binding||['sessionId','grantId','shareClaimId'].some(key=>typeof binding[key]!=='string'||!binding[key]||binding[key].length>200)||typeof publicKey!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(publicKey)||typeof receiver?.receive!=='function'||typeof receiver?.close!=='function')throw Error('Invalid signed receiver');
 const raw=Buffer.from(publicKey,'base64url');if(raw.length!==65||raw[0]!==4||raw.toString('base64url')!==publicKey||!ECDH.convertKey(raw,'prime256v1',undefined,undefined,'uncompressed').equals(raw))throw Error('Invalid public key');
 const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:raw.subarray(1,33).toString('base64url'),y:raw.subarray(33).toString('base64url')}});
 const fixed=Object.freeze({sessionId:binding.sessionId,grantId:binding.grantId,shareClaimId:binding.shareClaimId});let closed=false,lastInput=null,timer;
 const close=reason=>{if(closed)return;closed=true;if(timer!==undefined)clock.clear(timer);receiver.close(reason);};
 const expire=()=>{if(closed||lastInput===null)return;const remaining=1500-(clock.now()-lastInput);if(remaining<=0)close('input-idle');else timer=clock.set(expire,Math.ceil(remaining));};
 return {receive:packet=>{
  if(closed||!packet||typeof packet!=='object'||Array.isArray(packet)||Object.keys(packet).length!==4||packet.grantId!==fixed.grantId||!Number.isSafeInteger(packet.sequence)||packet.sequence<1||!packet.event||typeof packet.event!=='object'||Array.isArray(packet.event)||typeof packet.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(packet.signature))return false;
  try{const signature=Buffer.from(packet.signature,'base64url');if(signature.length!==64||signature.toString('base64url')!==packet.signature)return false;
   const payload=JSON.stringify([1,fixed.sessionId,fixed.grantId,fixed.shareClaimId,packet.sequence,packet.event]);if(Buffer.byteLength(payload)>2048||!verify('sha256',Buffer.from(payload),{key,dsaEncoding:'ieee-p1363'},signature))return false;
   if(lastInput!==null&&clock.now()-lastInput>=1500){close('input-idle');return false;}
   const accepted=receiver.receive({grantId:packet.grantId,sequence:packet.sequence,event:packet.event});
   if(accepted&&!closed){lastInput=clock.now();if(timer!==undefined)clock.clear(timer);timer=clock.set(expire,1500);}
   return accepted;
  }catch{return false;}
 },close};
}
module.exports={createSignedRemoteReceiver};
