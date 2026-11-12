"use client";
import { useEffect, useRef, useState } from "react";
import { CLASSROOM_IMAGE_MAX_BYTES, isChatImageId } from "@/lib/classroom/chat-image-message";
import { useTranslation } from "@/lib/i18n/context";

type Attachment = {file:File;uploadId:string;preview:string};
export function useChatImage(sessionId:string,shareAccess:string|null|undefined,scopeKey:string){
 const {t}=useTranslation();
 const [attachments,setAttachments]=useState<Record<string,Attachment>>({}),[errors,setErrors]=useState<Record<string,string>>({});
 const attachmentRef=useRef(new Map<string,Attachment>()),receipts=useRef(new Map<string,string>()),pending=useRef<AbortController|null>(null);
 useEffect(()=>{const owned=attachmentRef.current;return()=>{pending.current?.abort();for(const item of owned.values())URL.revokeObjectURL(item.preview);owned.clear();};},[]);
 const attachment=attachments[scopeKey]||null,error=errors[scopeKey]||"";
 const setError=(value:string)=>setErrors(current=>({...current,[scopeKey]:value}));
 function choose(file:File){
  if(file.size>CLASSROOM_IMAGE_MAX_BYTES||!file.size||!['image/png','image/jpeg','image/webp'].includes(file.type)){setError(t('classroomChat.imageInvalid'));return false;}
  const previous=attachmentRef.current.get(scopeKey);if(previous){URL.revokeObjectURL(previous.preview);receipts.current.delete(previous.uploadId);}
  const next={file,uploadId:crypto.randomUUID(),preview:URL.createObjectURL(file)};attachmentRef.current.set(scopeKey,next);setAttachments(current=>({...current,[scopeKey]:next}));setError('');return true;
 }
 async function upload(){
  if(!attachment)return undefined;const saved=receipts.current.get(attachment.uploadId);if(saved)return saved;
  const controller=new AbortController();pending.current=controller;const form=new FormData();form.set('uploadId',attachment.uploadId);form.set('image',attachment.file);
  try{const response=await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/images${shareAccess?'?shareAccess='+encodeURIComponent(shareAccess):''}`,{method:'POST',body:form,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});const body=await response.json();if(!response.ok||!isChatImageId(body.image?.id))throw new Error(t('classroomChat.imageFailed'));receipts.current.set(attachment.uploadId,body.image.id);return body.image.id;}finally{if(pending.current===controller)pending.current=null;}
 }
 function clear(){const current=attachmentRef.current.get(scopeKey);if(current){URL.revokeObjectURL(current.preview);receipts.current.delete(current.uploadId);attachmentRef.current.delete(scopeKey);}setAttachments(existing=>{const next={...existing};delete next[scopeKey];return next;});setError('');}
 return {attachment,error,setError,choose,upload,clear};
}
