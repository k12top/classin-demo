import {captionLanguageOptions,classroomLanguageForLocale} from "./classroom/languages";

export type TranslationPreference={enabled:boolean;target:string};
export const defaultTranslationPreference:TranslationPreference={enabled:true,target:"auto"};
export function translationPreferenceKey(userId:string){return `workspace:translation:${JSON.stringify(userId)}`;}
export function translationNotConfigured(error:unknown):boolean{
 return typeof error==="object"&&error!==null&&"code" in error&&error.code==="TRANSLATION_NOT_CONFIGURED";
}

/** Release only temporarily failed message/language keys for a reconnect retry. */
export function releaseTranslationRetries(retryable:Set<string>,attempted:Set<string>):string[]{
 const keys=[...retryable];for(const key of keys){retryable.delete(key);attempted.delete(key);}return keys;
}
export function parseTranslationPreference(raw:string|null):TranslationPreference{
 try{const data=raw?JSON.parse(raw):null;return {enabled:typeof data?.enabled==="boolean"?data.enabled:true,target:data?.target==="auto"||captionLanguageOptions("shengwang").some(item=>item.code===data?.target)?data.target:"auto"};}catch{return {...defaultTranslationPreference};}
}
export function translationTarget(target:string,locale:string){
 const code=target==="auto"?classroomLanguageForLocale(locale):target;
 return captionLanguageOptions("shengwang").some(item=>item.code===code)?code:"en-US";
}
export function distinctTranslation(original:string,translated:unknown):string|null {
 return typeof translated==="string"&&translated.trim()&&translated.trim()!==original.trim()?translated:null;
}
