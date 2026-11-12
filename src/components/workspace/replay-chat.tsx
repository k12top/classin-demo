"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from "react";
import Image from "next/image";
import {useTranslation} from "@/lib/i18n/context";
import {useTimeZone} from "@/lib/use-time-zone";
import {workspaceRequest} from "@/lib/workspace-client";
import {parseImageMessage} from "@/lib/classroom/chat-image-message";
import {replayReviewCopy} from "@/lib/replay-review-copy";
import styles from "./replay-chat.module.css";

type ReplayMessage={id:string;senderName:string;scope:string;kind:string;content:string;deleted:boolean;createdAt:string};
function ReplayChatImage({sessionId,messageId,alt,locale}:{sessionId:string;messageId:string;alt:string;locale:string}){
 const copy=replayReviewCopy(locale);
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 if(failed)return <div className={styles.imageError} role="alert"><span>{copy.imageFailed}</span><button type="button" onClick={()=>{setFailed(false);setAttempt(value=>value+1);}}>{copy.retry}</button></div>;
 const path=`/api/sessions/${encodeURIComponent(sessionId)}/replay-messages/${encodeURIComponent(messageId)}/image`;
 return <Image unoptimized width={260} height={180} className={styles.image} src={attempt?`${path}?retry=${attempt}`:path} alt={alt} onError={()=>setFailed(true)}/>;
}
export function ReplayChat({sessionId,previewStudentId}:{sessionId:string;previewStudentId?:string|null}){
 return <ReplayChatHistory key={JSON.stringify([sessionId,previewStudentId||null])} sessionId={sessionId} previewStudentId={previewStudentId}/>;
}
function ReplayChatHistory({sessionId,previewStudentId}:{sessionId:string;previewStudentId?:string|null}){
 const {locale}=useTranslation(),{timeZone}=useTimeZone(),copy=replayReviewCopy(locale);
 const [messages,setMessages]=useState<ReplayMessage[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const history=useRef<HTMLDivElement>(null),anchor=useRef<{id:string;offset:number}|null>(null),generation=useRef(0);
 const load=useCallback(async(before?:string,signal?:AbortSignal)=>{
  const current=++generation.current;
  const params=new URLSearchParams();if(before)params.set("before",before);if(previewStudentId){params.set("student",previewStudentId);params.set("view","chat");}
  const endpoint=previewStudentId?"replay-preview":"replay-messages";
  setLoading(true);setError(false);try{const result=await workspaceRequest<{messages:ReplayMessage[];nextCursor:string|null}>(`/api/sessions/${encodeURIComponent(sessionId)}/${endpoint}${params.size?`?${params}`:""}`,{signal});if(signal?.aborted||current!==generation.current)return;
   if(before&&history.current){const area=history.current,top=area.getBoundingClientRect().top,visible=[...area.querySelectorAll<HTMLElement>("[data-replay-message]")].find(item=>item.getBoundingClientRect().bottom>top);if(visible?.dataset.replayMessage)anchor.current={id:visible.dataset.replayMessage,offset:visible.getBoundingClientRect().top-top};}
   setMessages(current=>before?[...result.messages,...current.filter(message=>!result.messages.some(item=>item.id===message.id))]:result.messages);setCursor(result.nextCursor);
  }catch(failure){if(!signal?.aborted&&current===generation.current){const status=typeof failure==="object"&&failure!==null&&"status" in failure?Number(failure.status):0;if(status===401||status===403||status===404){setMessages([]);setCursor(null);anchor.current=null;}setError(true);}}finally{if(!signal?.aborted&&current===generation.current)setLoading(false);}
 },[sessionId,previewStudentId]);
 useEffect(()=>{const controller=new AbortController(),counter=generation;queueMicrotask(()=>{if(!controller.signal.aborted)void load(undefined,controller.signal);});return()=>{controller.abort();counter.current++;};},[load]);
 useLayoutEffect(()=>{const saved=anchor.current,area=history.current;anchor.current=null;if(!saved||!area)return;const item=[...area.querySelectorAll<HTMLElement>("[data-replay-message]")].find(node=>node.dataset.replayMessage===saved.id);if(item)area.scrollTop+=item.getBoundingClientRect().top-area.getBoundingClientRect().top-saved.offset;},[messages]);
 return <div className={styles.history} ref={history}>
  {previewStudentId&&<p className={styles.previewNotice}>{copy.sharedMessages}</p>}
  {error&&<p role="alert" className={styles.error}>{copy.chatFailed} <button type="button" onClick={()=>void load(messages.length?cursor||undefined:undefined)}>{copy.retry}</button></p>}
  {cursor&&<button type="button" className={styles.more} disabled={loading} onClick={()=>void load(cursor)}>{copy.earlierMessages}</button>}
  {loading&&!messages.length&&<p className={styles.empty}>{copy.loading}</p>}
  {!loading&&!messages.length&&!error&&<p className={styles.empty}>{copy.noMessages}</p>}
  <ol>{messages.map(message=>{const image=message.kind==="image"?parseImageMessage(message.content):null;const scope=message.scope==="direct"?copy.direct:message.scope==="staff"?copy.staff:message.scope==="room"?copy.group:"";return <li key={message.id} data-replay-message={message.id}><div><strong>{message.senderName}</strong>{scope&&<span>{scope}</span>}<time dateTime={message.createdAt}>{new Intl.DateTimeFormat(locale,{timeZone,dateStyle:"short",timeStyle:"short"}).format(new Date(message.createdAt))}</time></div>{image&&!message.deleted&&<ReplayChatImage sessionId={sessionId} messageId={message.id} alt={image.caption||copy.image} locale={locale}/>}<p>{message.deleted?copy.removed:message.kind==="image"?(image?.caption||""):message.content}</p></li>;})}</ol>
 </div>;
}
