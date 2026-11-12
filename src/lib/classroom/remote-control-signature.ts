import {parseRemoteInput,type RemoteInput} from './remote-control-input';

type Binding={sessionId:string;grantId:string;shareClaimId:string};
export type SignedRemotePacket={grantId:string;sequence:number;event:RemoteInput;signature:string};
const validId=(value:string)=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
function base64url(bytes:ArrayBuffer){let binary='';for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
/** Private key remains nonextractable and belongs to one approved grant. */
export async function createRemoteInputSigner(binding:Binding){
 if(!binding||!validId(binding.sessionId)||!validId(binding.grantId)||!validId(binding.shareClaimId))throw Error('Invalid control binding');
 const fixed=Object.freeze({...binding});
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const publicKey=base64url(await crypto.subtle.exportKey('raw',keys.publicKey));
 let tail:Promise<void>=Promise.resolve(),sequence=0,closed=false,pending=0;
 return {publicKey,close:()=>{closed=true;},sign:(input:unknown):Promise<SignedRemotePacket>=>{
  const event=parseRemoteInput(input);if(!event||closed)return Promise.reject(Error('Control unavailable'));
  if(pending>=64){closed=true;return Promise.reject(Error('Control input backlog'));}pending++;
  const result=tail.then(async()=>{if(closed)throw Error('Control unavailable');const next=sequence+1;if(!Number.isSafeInteger(next))throw Error('Control sequence exhausted');
   const payload=JSON.stringify([1,fixed.sessionId,fixed.grantId,fixed.shareClaimId,next,event]);
   const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(payload));
   if(closed)throw Error('Control unavailable');sequence=next;return {grantId:fixed.grantId,sequence:next,event,signature:base64url(signature)};
  });
  tail=result.then(()=>{pending--;},()=>{pending--;closed=true;});return result;
 }};
}
