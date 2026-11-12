import {parseRemoteInput,type RemoteInput} from './remote-control-input';
import type {SignedRemotePacket} from './remote-control-signature';
import type {ClassroomRemoteControlInput} from './signaling/types';

type Signer={sign:(input:unknown)=>Promise<SignedRemotePacket>;close:()=>void};
type Clock={now:()=>number;set:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;clear:(timer:ReturnType<typeof setTimeout>)=>void};
const defaultClock:Clock={now:()=>performance.now(),set:(fn,ms)=>setTimeout(fn,ms),clear:timer=>clearTimeout(timer)};
const validId=(value:string)=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value);
/** Serializes signing and direct delivery, coalescing only adjacent pointer moves. */
export function createRemoteControlTransport(input:{courseId:string;targetUserId:string;targetSignalingId:string;signer:Signer;publish:(userId:string,event:ClassroomRemoteControlInput)=>Promise<void>;onFailure:(reason:string)=>void;clock?:Clock}){
 const {courseId,targetUserId,targetSignalingId,signer,publish,onFailure}=input,clock=input.clock||defaultClock;
 if(!validId(courseId)||!validId(targetUserId)||!validId(targetSignalingId)||!signer||typeof signer.sign!=='function'||typeof signer.close!=='function'||typeof publish!=='function'||typeof onFailure!=='function')throw Error('Invalid control transport');
 let open=true,busy=false,lastSent=-Infinity,timer:ReturnType<typeof setTimeout>|undefined,timeout:ReturnType<typeof setTimeout>|undefined;
 const queue:RemoteInput[]=[];
 const close=()=>{if(!open)return;open=false;queue.length=0;if(timer!==undefined)clock.clear(timer);if(timeout!==undefined)clock.clear(timeout);signer.close();};
 const fail=(reason:string)=>{if(!open)return;close();onFailure(reason);};
 const pump=()=>{
  if(!open||busy||timer!==undefined||!queue.length)return;
  const wait=Math.max(0,40-(clock.now()-lastSent));
  if(wait>0){timer=clock.set(()=>{timer=undefined;pump();},wait);return;}
  const event=queue.shift()!;busy=true;
  const operation=signer.sign(event).then(packet=>{if(!open)throw Error('Control closed');lastSent=clock.now();return publish(targetSignalingId,{courseId,topic:'remote-control-input',revision:0,targetUserId,packet});});
  const deadline=new Promise<never>((_,reject)=>{timeout=clock.set(()=>reject(Error('Control transport timed out')),1500);});
  void Promise.race([operation,deadline]).then(()=>{if(timeout!==undefined)clock.clear(timeout);timeout=undefined;busy=false;pump();},()=>{if(timeout!==undefined)clock.clear(timeout);timeout=undefined;busy=false;fail('transport-unavailable');});
 };
 return {enqueue:(value:unknown)=>{
  if(!open)return false;const event=parseRemoteInput(value);if(!event)return false;
  if(event.type==='move'&&queue.at(-1)?.type==='move')queue[queue.length-1]=event;
  else{if(queue.length>=64){fail('input-backlog');return false;}queue.push(event);}
  pump();return true;
 },close,isOpen:()=>open};
}
