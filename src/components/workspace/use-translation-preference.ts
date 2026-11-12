"use client";
import {useCallback,useSyncExternalStore} from "react";
import {parseTranslationPreference,translationPreferenceKey,type TranslationPreference} from "@/lib/workspace-translation-preferences";

const eventName="workspace:translation-preference",memory=new Map<string,string>();
export function useTranslationPreference(userId:string){
 const key=translationPreferenceKey(userId);
 const subscribe=useCallback((notify:()=>void)=>{const storage=(event:StorageEvent)=>{if(event.key===key||event.key===null)notify();};window.addEventListener("storage",storage);window.addEventListener(eventName,notify);return()=>{window.removeEventListener("storage",storage);window.removeEventListener(eventName,notify);};},[key]);
 const snapshot=useCallback(()=>{try{return localStorage.getItem(key)||memory.get(key)||"";}catch{return memory.get(key)||"";}},[key]);
 const raw=useSyncExternalStore(subscribe,snapshot,()=>"");
 const setPreference=useCallback((preference:TranslationPreference)=>{const value=JSON.stringify(preference);memory.set(key,value);try{localStorage.setItem(key,value);}catch{/* The current window retains the setting. */}window.dispatchEvent(new Event(eventName));},[key]);
 return [parseTranslationPreference(raw),setPreference] as const;
}
