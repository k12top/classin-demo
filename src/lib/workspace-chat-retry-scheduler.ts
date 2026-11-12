import {retryChatAfterReconnect,type ChatRetryTarget} from "./workspace-chat-outbox";

type Timer=ReturnType<typeof setTimeout>;
type Clock={set:(callback:()=>void,delay:number)=>Timer;clear:(timer:Timer)=>void};
const delays=[1000,3000,7000] as const;

/** Schedule bounded retries per message; the outbox remains the source of truth. */
export function createChatRetryScheduler(onRetry:(target:ChatRetryTarget)=>void,clock:Clock={set:(fn,delay)=>setTimeout(fn,delay),clear:timer=>clearTimeout(timer)}){
 const timers=new Map<string,Timer>(),attempts=new Map<string,number>();
 const key=(target:ChatRetryTarget)=>JSON.stringify([target.storageKey,target.conversation,target.clientId]);
 const cancel=(target:ChatRetryTarget,reset=false)=>{const id=key(target),timer=timers.get(id);if(timer!==undefined){clock.clear(timer);timers.delete(id);}if(reset)attempts.delete(id);};
 return {
  schedule(target:ChatRetryTarget,error:unknown,online:boolean){
   if(!online||!retryChatAfterReconnect(error,0,1,true))return false;
   const id=key(target),attempt=attempts.get(id)||0;if(attempt>=delays.length||timers.has(id))return false;
   attempts.set(id,attempt+1);timers.set(id,clock.set(()=>{timers.delete(id);onRetry(target);},delays[attempt]));return true;
  },
  cancel,
  clear(){for(const timer of timers.values())clock.clear(timer);timers.clear();attempts.clear();},
 };
}
