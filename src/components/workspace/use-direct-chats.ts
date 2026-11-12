"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {createDirectChatListLoader,rememberOpenedChat,type DirectChat,type OpenedDirectChat} from "@/lib/workspace-direct-chat-list";
import {CHAT_READ_EVENT} from "./use-chat-unread";

export type {DirectChat} from "@/lib/workspace-direct-chat-list";
export function useDirectChats(){
 const [chats,setChats]=useState<DirectChat[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(false),requestVersion=useRef(0);
 const loader=useMemo(()=>createDirectChatListLoader(setChats),[]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{const version=++requestVersion.current;try{await loader.load(signal);if(!signal?.aborted&&version===requestVersion.current){setLoading(false);setError(false);}}catch(failure){if(!signal?.aborted&&version===requestVersion.current){setLoading(false);setError(true);}throw failure;}},[loader]);
 const remember=useCallback((chat:OpenedDirectChat)=>{requestVersion.current++;loader.invalidate();setChats(current=>rememberOpenedChat(current,chat));},[loader]);
 useEffect(()=>{const controller=new AbortController(),versionMarker=requestVersion;let busy=false,queued=false;
  const sync=()=>{if(document.visibilityState==="hidden")return;if(busy){queued=true;return;}busy=true;void refresh(controller.signal).catch(()=>{}).finally(()=>{busy=false;if(queued&&!controller.signal.aborted){queued=false;sync();}});};
  sync();const timer=setInterval(sync,20_000);window.addEventListener(CHAT_READ_EVENT,sync);window.addEventListener("online",sync);window.addEventListener("focus",sync);document.addEventListener("visibilitychange",sync);
  return()=>{controller.abort();versionMarker.current++;loader.invalidate();clearInterval(timer);window.removeEventListener(CHAT_READ_EVENT,sync);window.removeEventListener("online",sync);window.removeEventListener("focus",sync);document.removeEventListener("visibilitychange",sync);};
 },[refresh,loader]);
 return {chats,loading,error,refresh,remember};
}
