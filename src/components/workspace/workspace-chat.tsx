"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent} from "react";
import {CalendarDays,Plus,Send,UserRound,Users} from "lucide-react";
import {useTranslation} from "@/lib/i18n/context";
import {useTimeZone} from "@/lib/use-time-zone";
import {captionLanguageOptions} from "@/lib/classroom/languages";
import {distinctTranslation,releaseTranslationRetries,translationNotConfigured,translationTarget} from "@/lib/workspace-translation-preferences";
import {useTranslationPreference} from "./use-translation-preference";
import {workspaceChatTranslationCopy} from "./workspace-chat-translation-copy";
import {workspaceChatText as chatText} from "./workspace-chat-copy";
import {CLASSROOM_CHAT_MAX_CHARACTERS,chatCharacterCount} from "@/lib/classroom/chat-content";
import {workspaceRequest} from "@/lib/workspace-client";
import {createChatSync} from "@/lib/workspace-chat-sync";
import {emptyChatOutbox,restoreChatOutbox,retryChatAfterReconnect,pendingChatRetries,type ChatOutbox,type ChatRetryTarget,type PendingChatMessage as Pending} from "@/lib/workspace-chat-outbox";
import {createChatRetryScheduler} from "@/lib/workspace-chat-retry-scheduler";
import {upcomingLessons,workspaceChatCourse,type WorkspaceCourse,type WorkspaceLesson} from "@/lib/workspace-model";
import {workspaceConversationList} from "@/lib/workspace-conversation-list";
import {Dialog,DialogContent,DialogDescription,DialogTitle} from "@/components/ui/dialog";
import type {DirectChat} from "./use-direct-chats";
import type {OpenedDirectChat} from "@/lib/workspace-direct-chat-list";
import {WorkspaceEmpty,WorkspaceSearch} from "./workspace-shell";
import {CHAT_READ_EVENT,type ChatPreview} from "./use-chat-unread";
import styles from "./workspace.module.css";

type Message={id:string;senderId:string;senderName:string;clientId:string;content:string;createdAt:string};
const EMPTY_MESSAGES:Message[]=[];
const pathFor=(key:string)=>key.startsWith("direct:")?`/api/workspace/direct/${encodeURIComponent(key.slice(7))}`:`/api/workspace/courses/${encodeURIComponent(key)}/messages`;
const messagePath=(key:string)=>key.startsWith("direct:")?`${pathFor(key)}/messages`:pathFor(key);
export function WorkspaceChat({courses,userId,unread,previews={},directChats,directLoading,directError,onRefreshDirect,onDirectOpened,onCourse,onLesson,now,initialDirectId,initialCourseId}:{courses:WorkspaceCourse[];userId:string;unread:Record<string,number>;previews?:Record<string,ChatPreview|null>;directChats:DirectChat[];directLoading:boolean;directError:boolean;onRefreshDirect:()=>void;onDirectOpened:(chat:OpenedDirectChat)=>void;onCourse:(course:WorkspaceCourse)=>void;onLesson?:(lesson:WorkspaceLesson)=>void;now?:number;initialDirectId?:string;initialCourseId?:string}){
 const {locale}=useTranslation(),{timeZone}=useTimeZone(),translationCopy=workspaceChatTranslationCopy(locale);
 const [newDirect,setNewDirect]=useState(false),[selected,setSelected]=useState(initialCourseId || (initialDirectId?`direct:${initialDirectId}`:"")),[query,setQuery]=useState(""),[messages,setMessages]=useState<Record<string,Message[]>>({}),[cursors,setCursors]=useState<Record<string,string|null>>({}),[drafts,setDrafts]=useState<Record<string,string>>({}),[pending,setPending]=useState<Record<string,Pending[]>>({}),[errors,setErrors]=useState<Record<string,string>>({}),[loadingOlder,setLoadingOlder]=useState(false);
 const [conversationFilter,setConversationFilter]=useState<"all"|"direct">("all");
 const [preference,setPreference]=useTranslationPreference(userId),translate=preference.enabled,language=translationTarget(preference.target,locale);
 const [translations,setTranslations]=useState<Record<string,string>>({}),[translationFailures,setTranslationFailures]=useState<Set<string>>(()=>new Set()),[translationUnavailable,setTranslationUnavailable]=useState<Set<string>>(()=>new Set()),[translationRetry,setTranslationRetry]=useState(0),[originals,setOriginals]=useState<Set<string>>(()=>new Set());
 const [restoredKey,setRestoredKey]=useState(""),[nearBottom,setNearBottom]=useState(true),[focused,setFocused]=useState(false),[retryGeneration,setRetryGeneration]=useState(0);
 const latest=useRef<HTMLDivElement>(null),scrollArea=useRef<HTMLDivElement>(null),attempted=useRef(new Set<string>()),retryableTranslations=useRef(new Set<string>()),composing=useRef(false),readHeads=useRef<Record<string,Message>>({}),acknowledged=useRef<Record<string,string>>({}),ackInFlight=useRef(new Set<string>());
 const historyAnchor=useRef<{conversation:string;messageId:string;offset:number}|null>(null);
 const readGeneration=useRef<Record<string,number>>({});
 const requestSequence=useRef(0);
 const readSuccess=useRef<Record<string,number>>({});
 const refreshCurrent=useRef<()=>void>(()=>{});
 const storageKey=`workspace:chat:${encodeURIComponent(userId)}`;
 const restored=restoredKey===storageKey;
 const outboxState=useRef<ChatOutbox>(emptyChatOutbox()),ready=useRef(false),alive=useRef(false),activeStorage=useRef(""),sending=useRef(new Set<string>()),networkEpoch=useRef(0);
 const queuedRetries=useRef<ChatRetryTarget[]>([]);
 const retryScheduler=useRef<ReturnType<typeof createChatRetryScheduler>|null>(null);
 useEffect(()=>{const scheduler=createChatRetryScheduler(target=>{if(activeStorage.current===storageKey){queuedRetries.current.push(target);setRetryGeneration(value=>value+1);}});retryScheduler.current=scheduler;return()=>{scheduler.clear();if(retryScheduler.current===scheduler)retryScheduler.current=null;};},[storageKey]);
 const [storageWarning,setStorageWarning]=useState(false);
 const commit=useCallback((next:ChatOutbox)=>{if(!alive.current||!ready.current||activeStorage.current!==storageKey)return;outboxState.current=next;setDrafts(next.drafts);setPending(next.pending);try{sessionStorage.setItem(storageKey,JSON.stringify(next));setStorageWarning(false);}catch{setStorageWarning(true);}},[storageKey]);
 const changePending=useCallback((change:(current:Record<string,Pending[]>)=>Record<string,Pending[]>)=>{if(!ready.current)return;const current=outboxState.current,pending=change(current.pending);if(pending!==current.pending)commit({...current,pending});},[commit]);
 useEffect(()=>{let cancelled=false;alive.current=true;ready.current=false;activeStorage.current=storageKey;queueMicrotask(()=>{if(cancelled)return;let saved=emptyChatOutbox();try{saved=restoreChatOutbox(sessionStorage.getItem(storageKey));}catch{/* Continue using an in-memory outbox. */}outboxState.current=saved;setDrafts(saved.drafts);setPending(saved.pending);ready.current=true;setRestoredKey(storageKey);});return()=>{cancelled=true;alive.current=false;ready.current=false;activeStorage.current="";};},[storageKey]);
 const activeDirect=selected.startsWith("direct:")?directChats.find(chat=>`direct:${chat.id}`===selected):undefined;
 const active=activeDirect?undefined:workspaceChatCourse(courses,selected),id=activeDirect?`direct:${activeDirect.id}`:active?.id||"",outbox=pending[id]||[],draft=drafts[id]||"";
 const list=messages[id]||EMPTY_MESSAGES;
 const base=id?pathFor(id):"";
 const clearConversation=useCallback((conversation:string)=>{
  readGeneration.current[conversation]=(readGeneration.current[conversation]||0)+1;
  delete readHeads.current[conversation];delete acknowledged.current[conversation];
  const prefix=`${conversation}:`;
  for(const key of attempted.current)if(key.startsWith(prefix))attempted.current.delete(key);
  for(const key of retryableTranslations.current)if(key.startsWith(prefix))retryableTranslations.current.delete(key);
  setMessages(current=>({...current,[conversation]:[]}));setCursors(current=>{const next={...current};delete next[conversation];return next;});
  setTranslations(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!key.startsWith(prefix))));
  setTranslationFailures(current=>new Set([...current].filter(key=>!key.startsWith(prefix))));
  setTranslationUnavailable(current=>new Set([...current].filter(key=>!key.startsWith(prefix))));
  setOriginals(current=>new Set([...current].filter(key=>!key.startsWith(prefix))));
 },[]);
 const read=useCallback(async(courseId:string,before?:string,signal?:AbortSignal)=>{
  const generation=readGeneration.current[courseId]||0,readTicket=++requestSequence.current;
  try{
  let after=before?null:readHeads.current[courseId]?.id||null,more:string|null;
  do{
   const params=new URLSearchParams();if(before)params.set("before",before);else if(after)params.set("after",after);
   const path=`${messagePath(courseId)}${params.size?`?${params}`:""}`;
   const result:{messages:Message[];nextCursor:string|null}=await workspaceRequest(path,{signal});
   if(signal?.aborted||generation!==(readGeneration.current[courseId]||0))return;
   readSuccess.current[courseId]=Math.max(readSuccess.current[courseId]||0,readTicket);
   if(before&&scrollArea.current?.dataset.chatConversation===courseId){const area=scrollArea.current,top=area.getBoundingClientRect().top;const visible=[...area.querySelectorAll<HTMLElement>("[data-chat-message]")].find(element=>element.getBoundingClientRect().bottom>top);if(visible?.dataset.chatMessage)historyAnchor.current={conversation:courseId,messageId:visible.dataset.chatMessage,offset:visible.getBoundingClientRect().top-top};}
   setMessages(current=>{const merged=new Map((current[courseId]||[]).map(message=>[message.id,message]));for(const message of result.messages)merged.set(message.id,message);return {...current,[courseId]:[...merged.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))};});
   changePending(current=>{const items=current[courseId];if(!items?.some(item=>result.messages.some(message=>message.senderId===userId&&message.clientId===item.clientId)))return current;return {...current,[courseId]:items.filter(item=>!result.messages.some(message=>message.senderId===userId&&message.clientId===item.clientId))};});
   if(before||!after)setCursors(current=>before||!(courseId in current)?{...current,[courseId]:result.nextCursor}:current);
   if(!before){const last=result.messages.at(-1),head=readHeads.current[courseId];if(last&&(!head||last.createdAt>head.createdAt||(last.createdAt===head.createdAt&&last.id>head.id)))readHeads.current[courseId]=last;}
   more=after?result.nextCursor:null;after=more;
  }while(more&&!signal?.aborted);
  setErrors(current=>({...current,[courseId]:""}));
  }catch(failure){
   const status=(failure as {status?:number})?.status;
   if(!signal?.aborted&&generation===(readGeneration.current[courseId]||0)&&(readSuccess.current[courseId]||0)<=readTicket&&(status===401||status===403||status===404)){
    clearConversation(courseId);
   }
   throw failure;
  }
 },[userId,changePending,clearConversation]);
 useEffect(()=>{if(!id||!restored)return;const controller=new AbortController();
  const sync=createChatSync(()=>read(id,undefined,controller.signal),()=>document.visibilityState!=="hidden",()=>setErrors(current=>({...current,[id]:chatText(locale,"同步失败，请重试","Sync failed. Please retry.")})));
  const refresh=sync.trigger;refreshCurrent.current=refresh;refresh();const timer=setInterval(refresh,3000);
  window.addEventListener("online",refresh);window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
  return()=>{sync.stop();controller.abort();refreshCurrent.current=()=>{};clearInterval(timer);window.removeEventListener("online",refresh);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
 },[id,read,locale,restored]);
 useEffect(()=>{const update=()=>setFocused(document.visibilityState==="visible"&&document.hasFocus());update();window.addEventListener("focus",update);window.addEventListener("blur",update);document.addEventListener("visibilitychange",update);return()=>{window.removeEventListener("focus",update);window.removeEventListener("blur",update);document.removeEventListener("visibilitychange",update);};},[]);
 useLayoutEffect(()=>{const anchor=historyAnchor.current,area=scrollArea.current;if(!anchor)return;historyAnchor.current=null;if(!area||anchor.conversation!==id)return;const message=[...area.querySelectorAll<HTMLElement>("[data-chat-message]")].find(element=>element.dataset.chatMessage===anchor.messageId);if(message)area.scrollTop+=message.getBoundingClientRect().top-area.getBoundingClientRect().top-anchor.offset;},[id,list]);
 useEffect(()=>{if(nearBottom)latest.current?.scrollIntoView({block:"end"});},[id,list,nearBottom]);
 useEffect(()=>{const last=list.at(-1);if(!id||!last||!nearBottom||!focused||acknowledged.current[id]===last.id||ackInFlight.current.has(`${id}:${last.id}`))return;
  const key=`${id}:${last.id}`;ackInFlight.current.add(key);
  void workspaceRequest(`${base}/read`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messageId:last.id})}).then(()=>{acknowledged.current[id]=last.id;window.dispatchEvent(new Event(CHAT_READ_EVENT));}).catch(()=>{}).finally(()=>ackInFlight.current.delete(key));
 },[base,id,list,nearBottom,focused]);
 useEffect(()=>{if(!translate||!id)return;const prefix=`${id}:${language}:`;if([...translationUnavailable].some(key=>key.startsWith(prefix)))return;const ids=list.filter(message=>message.senderId!==userId&&!attempted.current.has(prefix+message.id)).slice(0,20).map(message=>message.id);if(!ids.length)return;
  const startedAt=networkEpoch.current,readVersion=++requestSequence.current,readEpoch=readGeneration.current[id]||0;ids.forEach(value=>attempted.current.add(prefix+value));
  void workspaceRequest<{translations:Record<string,string>}>(`${base}/translate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messageIds:ids,language})},30_000).then(result=>{
   if(!alive.current||activeStorage.current!==storageKey||(readGeneration.current[id]||0)!==readEpoch)return;
   const received=ids.filter(value=>typeof result.translations?.[value]==="string"&&result.translations[value].trim());
   const missing=ids.filter(value=>!received.includes(value));received.forEach(value=>retryableTranslations.current.delete(prefix+value));missing.forEach(value=>retryableTranslations.current.add(prefix+value));
   setTranslationUnavailable(current=>{const next=new Set(current);received.forEach(value=>next.delete(prefix+value));return next;});
   setTranslations(current=>({...current,...Object.fromEntries(received.map(value=>[prefix+value,result.translations[value]]))}));
   setTranslationFailures(current=>{const next=new Set(current);for(const value of ids){if(received.includes(value))next.delete(prefix+value);else next.add(prefix+value);}return next;});
   if(missing.length&&navigator.onLine&&networkEpoch.current>startedAt){missing.forEach(value=>{attempted.current.delete(prefix+value);retryableTranslations.current.delete(prefix+value);});setTranslationRetry(value=>value+1);}
  }).catch(error=>{if(!alive.current||activeStorage.current!==storageKey||(readGeneration.current[id]||0)!==readEpoch)return;const status=typeof error==="object"&&error!==null&&"status" in error?error.status:undefined;if(status===401||status===403||status===404){
   if((readSuccess.current[id]||0)<=readVersion){clearConversation(id);setErrors(current=>({...current,[id]:chatText(locale,"无法访问聊天，请确认权限后重试。","Unable to access chat. Check your access and retry.")}));}
   else {ids.forEach(value=>attempted.current.delete(prefix+value));if(scrollArea.current?.dataset.chatConversation===id)refreshCurrent.current();}
   return;
  }const unavailable=translationNotConfigured(error),recoverable=!unavailable&&retryChatAfterReconnect(error,0,1,true);if(recoverable)ids.forEach(value=>retryableTranslations.current.add(prefix+value));
   if(unavailable)setTranslationUnavailable(current=>new Set([...current,...ids.map(value=>prefix+value)]));
   if(recoverable&&retryChatAfterReconnect(error,startedAt,networkEpoch.current,navigator.onLine)){ids.forEach(value=>{attempted.current.delete(prefix+value);retryableTranslations.current.delete(prefix+value);});setTranslationRetry(value=>value+1);}
   else setTranslationFailures(current=>new Set([...current,...ids.map(value=>prefix+value)]));});
 },[translate,id,language,list,userId,base,translations,translationFailures,translationUnavailable,translationRetry,locale,storageKey,clearConversation]);
 const translationPrefix=`${id}:${language}:`,translationError=[...translationFailures].some(key=>key.startsWith(translationPrefix)),translationUnavailableHere=[...translationUnavailable].some(key=>key.startsWith(translationPrefix));
 const retryTranslation=()=>{const failed=[...translationFailures].filter(key=>key.startsWith(translationPrefix));failed.forEach(key=>{attempted.current.delete(key);retryableTranslations.current.delete(key);});setTranslationFailures(current=>{const next=new Set(current);failed.forEach(key=>next.delete(key));return next;});setTranslationUnavailable(current=>{const next=new Set(current);failed.forEach(key=>next.delete(key));return next;});setTranslationRetry(value=>value+1);};
 const messageContent=(message:Message)=>{const key=`${id}:${language}:${message.id}`,translated=distinctTranslation(message.content,translate?translations[key]:undefined),showOriginal=originals.has(key);
  return <><p translate="no" lang={translated?language:undefined}>{translated||message.content}</p>{translated&&<div className={styles.chatTranslationMeta}><span>{translationCopy.translated}</span><button type="button" className={styles.textButton} aria-expanded={showOriginal} onClick={()=>setOriginals(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next;})}>{showOriginal?(translationCopy.hideOriginal):(translationCopy.showOriginal)}</button>{showOriginal&&<p className={styles.chatTranslated} translate="no">{message.content}</p>}</div>}</>;
 };
 const send=useCallback(async(courseId:string,item:Pending)=>{
  const key=JSON.stringify([storageKey,courseId,item.clientId]);if(sending.current.has(key))return;sending.current.add(key);const startedAt=networkEpoch.current;
  const target={storageKey,conversation:courseId,clientId:item.clientId};retryScheduler.current?.cancel(target);
  changePending(current=>({...current,[courseId]:(current[courseId]||[]).map(value=>value.clientId===item.clientId?{...value,status:"sending"}:value)}));
  try{const result=await workspaceRequest<{message:Message}>(messagePath(courseId),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:item.clientId,content:item.content})});
   if(activeStorage.current!==storageKey)return;retryScheduler.current?.cancel(target,true);
   setMessages(current=>({...current,[courseId]:[...(current[courseId]||[]).filter(message=>message.id!==result.message.id),result.message].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))}));
   changePending(current=>({...current,[courseId]:(current[courseId]||[]).filter(value=>value.clientId!==item.clientId)}));
   window.dispatchEvent(new Event(CHAT_READ_EVENT));
  }catch(error){let retrying=false;if(activeStorage.current===storageKey){if(retryChatAfterReconnect(error,startedAt,networkEpoch.current,navigator.onLine)){retrying=true;queuedRetries.current.push(target);setRetryGeneration(value=>value+1);}else retrying=retryScheduler.current?.schedule(target,error,navigator.onLine)||false;}changePending(current=>({...current,[courseId]:(current[courseId]||[]).map(value=>value.clientId===item.clientId?{...value,status:retrying?"retrying":"failed"}:value)}));}finally{sending.current.delete(key);}
 },[changePending,storageKey,retryScheduler]);
 useEffect(()=>{if(!restored)return;
  const retry=()=>{if(!ready.current||!navigator.onLine)return;for(const [conversation,items] of Object.entries(outboxState.current.pending))for(const item of items)if(item.status==="failed"||item.status==="retrying"){retryScheduler.current?.cancel({storageKey,conversation,clientId:item.clientId},true);void send(conversation,item);}};
  const reconnected=()=>{networkEpoch.current++;queuedRetries.current=[];retry();const keys=releaseTranslationRetries(retryableTranslations.current,attempted.current);if(keys.length){setTranslationFailures(current=>{const next=new Set(current);keys.forEach(key=>next.delete(key));return next;});setTranslationRetry(value=>value+1);}};retry();window.addEventListener("online",reconnected);return()=>window.removeEventListener("online",reconnected);
 },[restored,send,retryScheduler,storageKey]);
 useEffect(()=>{if(!restored||!ready.current||!navigator.onLine)return;
  const targets=queuedRetries.current.splice(0);
  const retries=pendingChatRetries(outboxState.current,storageKey,targets),active=new Set(retries.map(({conversation,message})=>JSON.stringify([storageKey,conversation,message.clientId])));
  for(const target of targets)if(!active.has(JSON.stringify([target.storageKey,target.conversation,target.clientId])))retryScheduler.current?.cancel(target,true);
  for(const {conversation,message} of retries)void send(conversation,message);
 },[restored,send,storageKey,retryGeneration,retryScheduler]);
 const submit=(event?:FormEvent)=>{event?.preventDefault();const current=outboxState.current,content=(current.drafts[id]||"").trim();if(!ready.current||!id||!content||chatCharacterCount(content)>CLASSROOM_CHAT_MAX_CHARACTERS)return;const item:Pending={clientId:crypto.randomUUID(),content,status:"sending"};commit({drafts:{...current.drafts,[id]:""},pending:{...current.pending,[id]:[...(current.pending[id]||[]),item]}});void send(id,item);requestAnimationFrame(()=>latest.current?.scrollIntoView({block:"end"}));};
 const previewTime=(preview:ChatPreview|null|undefined)=>preview&&Number.isFinite(Date.parse(preview.createdAt))?new Intl.DateTimeFormat(locale,{timeZone,month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(preview.createdAt)):"";
 const nextLesson=active&&now&&onLesson?upcomingLessons([active],now)[0]:undefined;
 const conversations=workspaceConversationList(courses,directChats,previews,query,conversationFilter);
 return <div className={styles.chatLayout}><aside className={styles.chatSidebar}><header><div className={styles.chatSidebarTitle}><h1>{chatText(locale,"聊天","Chat")}</h1><button type="button" className={styles.iconButton} onClick={()=>setNewDirect(true)} aria-label={chatText(locale,"发起私聊","New direct message")}><Plus size={16}/></button></div><WorkspaceSearch label={chatText(locale,"搜索会话","Search conversations")} value={query} onChange={setQuery}/></header><div className={styles.chatFilters} role="group" aria-label={chatText(locale,"会话筛选","Conversation filter")}><button type="button" aria-pressed={conversationFilter==="all"} onClick={()=>setConversationFilter("all")}>{chatText(locale,"全部","All")}</button><button type="button" aria-pressed={conversationFilter==="direct"} onClick={()=>setConversationFilter("direct")}>{chatText(locale,"私聊","Direct")}</button></div>{directLoading&&<p className={styles.chatListStatus} role="status">{chatText(locale,"正在加载私聊…","Loading direct messages…")}</p>}{directError&&<p className={styles.chatListStatus} role="alert">{chatText(locale,"私聊列表加载失败。","Unable to load direct messages.")} <button type="button" className={styles.textButton} onClick={onRefreshDirect}>{chatText(locale,"重试","Retry")}</button></p>}<nav aria-label={chatText(locale,"会话列表","Conversations")}>{conversations.map(row=>{const direct=row.kind==="direct",chat=direct?row.chat:null,course=row.kind==="class"?row.course:null,key=chat?`direct:${chat.id}`:course!.id,count=chat?chat.unread:unread[course!.id]||0;return <button type="button" className={styles.chatChoice} key={key} aria-current={id===key?"page":undefined} onClick={()=>{setNearBottom(true);setSelected(key);}}><span className={styles.chatAvatar}>{direct?<UserRound size={16}/>:<Users size={16}/>}</span><span><strong>{chat?.peerName||course?.name}</strong><small>{row.preview?.content||(chat?courses.find(item=>item.id===chat.courseId)?.name:chatText(locale,"班级群聊","Class conversation"))||""}</small></span><span className={styles.chatChoiceMeta}>{row.preview&&<time className={styles.chatPreviewTime} dateTime={row.preview.createdAt}>{previewTime(row.preview)}</time>}{count>0&&<b className={styles.unreadBadge}>{count>99?"99+":count}</b>}</span></button>;})}</nav>{!directLoading&&!directError&&!conversations.length&&<p className={styles.chatListStatus}>{conversationFilter==="direct"&&!query?chatText(locale,"暂无私聊","No direct messages yet"):chatText(locale,"没有找到会话","No conversations found")}</p>}</aside>
 {active||activeDirect?<section className={styles.chatContent}><header className={styles.chatHeader}><span className={styles.chatAvatar}>{activeDirect?<UserRound size={16}/>:<Users size={16}/>}</span><div><h1>{activeDirect?.peerName||active?.name}</h1><small>{activeDirect?(chatText(locale,"私聊","Direct message")):(chatText(locale,"班级群聊","Class conversation"))}</small></div>{active&&<button type="button" className={styles.textButton} onClick={()=>onCourse(active)}>{chatText(locale,"查看班级","View class")}</button>}</header>
 {nextLesson&&onLesson&&<div className={styles.chatLesson}><CalendarDays size={14} aria-hidden="true"/><span><strong>{nextLesson.sessionTitle||nextLesson.name}</strong><time dateTime={nextLesson.startTime}>{new Intl.DateTimeFormat(locale,{timeZone,dateStyle:"medium",timeStyle:"short"}).format(new Date(nextLesson.startTime))} · {timeZone}</time></span><button type="button" className={styles.textButton} onClick={()=>onLesson(nextLesson)}>{chatText(locale,"查看课节","View lesson")}</button></div>}
 <div className={styles.chatTranslate}><label className={styles.checkLabel}><input type="checkbox" checked={translate} onChange={event=>setPreference({...preference,enabled:event.target.checked})}/>{translationCopy.auto}</label><select aria-label={translationCopy.language} value={preference.target} onChange={event=>setPreference({...preference,target:event.target.value})}><option value="auto">{translationCopy.follow}</option>{captionLanguageOptions("shengwang").map(item=><option key={item.code} value={item.code}>{item.nativeLabel}</option>)}</select>{translate&&translationError&&<><span role="status">{translationUnavailableHere?(translationCopy.unavailable):(translationCopy.failed)}</span><button className={styles.textButton} type="button" onClick={retryTranslation}>{translationCopy.retry}</button></>}<span className={styles.chatTimeZone}>{timeZone}</span></div>
 <div ref={scrollArea} data-chat-conversation={id} onScroll={event=>{const target=event.currentTarget;setNearBottom(target.scrollHeight-target.scrollTop-target.clientHeight<40);}} className={styles.chatMessages} role="log" aria-live="polite">{errors[id]&&<div className={styles.error} role="alert">{errors[id]} <button type="button" onClick={()=>refreshCurrent.current()}>{chatText(locale,"重试","Retry")}</button></div>}{cursors[id]&&<button type="button" className={styles.button} disabled={loadingOlder} onClick={()=>{setNearBottom(false);setLoadingOlder(true);void read(id,cursors[id]||undefined).catch(()=>setErrors(current=>({...current,[id]:chatText(locale,"读取失败","Unable to load")}))).finally(()=>setLoadingOlder(false));}}>{chatText(locale,"加载更早消息","Load earlier messages")}</button>}{list.map(message=><article data-chat-message={message.id} className={`${styles.chatMessage} ${message.senderId===userId?styles.chatOwn:""}`} key={message.id}><span className={styles.chatAvatar}>{message.senderName.slice(0,1)}</span><div><small>{message.senderName} · {new Intl.DateTimeFormat(locale,{timeZone,dateStyle:"short",timeStyle:"short"}).format(new Date(message.createdAt))}</small>{messageContent(message)}</div></article>)}{outbox.map(item=><article className={`${styles.chatMessage} ${styles.chatOwn}`} key={item.clientId}><span className={styles.chatAvatar}>{chatText(locale,"我","Me")}</span><div><small>{item.status==="sending"?(chatText(locale,"发送中","Sending")):item.status==="retrying"?(chatText(locale,"等待自动重试","Retry scheduled")):(chatText(locale,"发送失败","Failed"))}</small><p>{item.content}</p>{item.status!=="sending"&&<button type="button" className={styles.textButton} onClick={()=>{retryScheduler.current?.cancel({storageKey,conversation:id,clientId:item.clientId},true);void send(id,item);}}>{chatText(locale,"重试","Retry")}</button>}</div></article>)}{!list.length&&!outbox.length&&!errors[id]&&<WorkspaceEmpty title={activeDirect?(chatText(locale,"开始私聊","Start a conversation")):(chatText(locale,"开始班级聊天","Start a class conversation"))}/>}<div ref={latest}/></div>
 <form className={styles.chatComposer} onSubmit={submit}><label htmlFor="workspace-chat-input">{chatText(locale,"文字消息","Message")}</label><textarea id="workspace-chat-input" value={draft} placeholder={chatText(locale,"输入消息，Enter 发送，Shift + Enter 换行","Type a message. Enter to send; Shift + Enter for a new line.")} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} disabled={!restored} onChange={event=>commit({...outboxState.current,drafts:{...outboxState.current.drafts,[id]:event.target.value}})} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing&&!composing.current){event.preventDefault();submit();}}}/>{storageWarning&&<p role="status">{chatText(locale,"无法保存本地草稿，离开页面后待发送消息可能丢失。","Local storage is unavailable. Unsent messages may be lost when you leave.")}</p>}<footer><span>{chatCharacterCount(draft)}/{CLASSROOM_CHAT_MAX_CHARACTERS}</span><button type="submit" className={styles.primary} disabled={!restored||!draft.trim()||chatCharacterCount(draft)>CLASSROOM_CHAT_MAX_CHARACTERS}><Send size={13}/>{chatText(locale,"发送","Send")}</button></footer></form></section>:<WorkspaceEmpty title={selected?(chatText(locale,"会话暂不可用，请选择其他会话","Conversation unavailable. Choose another conversation.")):(chatText(locale,"加入班级后即可聊天","Join a class to chat"))}/>}<Dialog open={newDirect} onOpenChange={setNewDirect}><DialogContent className={styles.dialog}><DialogTitle>{chatText(locale,"发起私聊","New direct message")}</DialogTitle><DialogDescription className={styles.srOnly}>{chatText(locale,"选择共同班级中的成员","Choose someone from a shared class")}</DialogDescription>{newDirect&&<DirectChatForm courses={courses} locale={locale} onOpened={chat=>{onDirectOpened(chat);setSelected(`direct:${chat.id}`);setNewDirect(false);}}/>}</DialogContent></Dialog></div>;
}

function DirectChatForm({courses,locale,onOpened}:{courses:WorkspaceCourse[];locale:string;onOpened:(chat:OpenedDirectChat)=>void}){
 const [courseId,setCourseId]=useState(courses[0]?.id||""),[peerId,setPeerId]=useState(""),[contacts,setContacts]=useState<{id:string;name:string}[]>([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{if(!courseId)return;const controller=new AbortController();queueMicrotask(()=>{if(controller.signal.aborted)return;setLoading(true);setError("");setContacts([]);setPeerId("");void workspaceRequest<{contacts:{id:string;name:string}[]}>(`/api/workspace/direct/contacts?courseId=${encodeURIComponent(courseId)}`,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setContacts(result.contacts);}).catch(()=>{if(!controller.signal.aborted)setError(chatText(locale,"无法读取班级成员，请重试。","Unable to load class members."));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});});return()=>controller.abort();},[courseId,locale]);
 const submit=async(event:FormEvent)=>{event.preventDefault();if(busy||!peerId)return;setBusy(true);setError("");try{const result=await workspaceRequest<{chat:OpenedDirectChat}>("/api/workspace/direct",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({courseId,peerId})});onOpened(result.chat);}catch{setError(chatText(locale,"无法发起私聊，请重试。","Unable to start conversation. Please retry."));}finally{setBusy(false);}};
 return <form className={styles.form} onSubmit={event=>void submit(event)}><label>{chatText(locale,"共同班级","Shared class")}<select value={courseId} onChange={event=>setCourseId(event.target.value)} disabled={busy}>{!courses.length&&<option value="">{chatText(locale,"暂无班级","No classes")}</option>}{courses.map(course=><option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label>{chatText(locale,"成员","Member")}<select value={peerId} onChange={event=>setPeerId(event.target.value)} disabled={busy||loading||!courseId}><option value="">{loading?(chatText(locale,"加载中…","Loading…")):(chatText(locale,"选择成员","Choose a member"))}</option>{contacts.map(contact=><option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>{!loading&&courseId&&!contacts.length&&!error&&<p>{chatText(locale,"此班级暂无其他成员。","There are no other class members.")}</p>}{error&&<p role="alert" className={styles.formError}>{error}</p>}<footer><button className={styles.primary} disabled={busy||loading||!peerId}>{chatText(locale,"开始聊天","Start chat")}</button></footer></form>;
}
