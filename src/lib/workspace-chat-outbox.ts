import {chatCharacterCount,CLASSROOM_CHAT_MAX_CHARACTERS} from "./classroom/chat-content";
import {taskRequestId} from "./workspace-task-validation";

export type PendingChatMessage={clientId:string;content:string;status:"sending"|"retrying"|"failed"};
export type ChatOutbox={drafts:Record<string,string>;pending:Record<string,PendingChatMessage[]>};
export function emptyChatOutbox():ChatOutbox{return {drafts:{},pending:{}};}
/** A reconnect can happen while an earlier request is still timing out. */
export function retryChatAfterReconnect(error:unknown,startedAt:number,current:number,online:boolean):boolean{
 const status=typeof error==="object"&&error!==null&&"status" in error?Number(error.status):0;
 return online&&current>startedAt&&(!status||status===408||status===429||status>=500);
}
export type ChatRetryTarget={storageKey:string;conversation:string;clientId:string};
/** Reconcile queued retries with the current outbox: messages may already be acknowledged. */
export function pendingChatRetries(outbox:ChatOutbox,storageKey:string,targets:readonly ChatRetryTarget[]):Array<{conversation:string;message:PendingChatMessage}>{
 const seen=new Set<string>(),result:Array<{conversation:string;message:PendingChatMessage}>=[];
 for(const target of targets){
  if(target.storageKey!==storageKey)continue;
  const key=JSON.stringify([target.conversation,target.clientId]);if(seen.has(key))continue;seen.add(key);
  const message=outbox.pending[target.conversation]?.find(item=>item.clientId===target.clientId&&(item.status==="failed"||item.status==="retrying"));
  if(message)result.push({conversation:target.conversation,message});
 }
 return result;
}
/** Restore only well-formed records, keeping each original message ID for safe retry. */
export function restoreChatOutbox(raw:string|null):ChatOutbox{
 const result:ChatOutbox={drafts:Object.create(null),pending:Object.create(null)};
 try{
  if(!raw||raw.length>5_000_000)return result;
  const saved=JSON.parse(raw);
  if(saved?.drafts&&typeof saved.drafts==="object"&&!Array.isArray(saved.drafts))for(const [key,value] of Object.entries(saved.drafts))if(key&&key.length<=250&&typeof value==="string")result.drafts[key]=value;
  if(saved?.pending&&typeof saved.pending==="object"&&!Array.isArray(saved.pending))for(const [key,value] of Object.entries(saved.pending)){
   if(!key||key.length>250||!Array.isArray(value))continue;
   const ids=new Set<string>();result.pending[key]=value.flatMap(item=>{try{const clientId=taskRequestId(item?.clientId);if(ids.has(clientId)||typeof item.content!=="string"||!item.content.trim()||chatCharacterCount(item.content)>CLASSROOM_CHAT_MAX_CHARACTERS)return [];ids.add(clientId);return [{clientId,content:item.content,status:"failed" as const}];}catch{return [];}});
  }
 }catch{/* Ignore malformed storage. */}
 return result;
}
