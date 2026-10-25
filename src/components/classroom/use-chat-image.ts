"use client";
import { useEffect, useRef, useState } from "react";
import { CLASSROOM_IMAGE_MAX_BYTES, isChatImageId } from "@/lib/classroom/chat-image-message";
import { useTranslation } from "@/lib/i18n/context";

export function useChatImage(sessionId:string,shareAccess?:string|null){
 const {t}=useTranslation();const [attachment,setAttachment]=useState<{file:File;uploadId:string;preview:string}|null>(null),[error,setError]=useState('');const receipt=useRef<{uploadId:string;imageId:string}|null>(null),pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 useEffect(()=>()=>{if(attachment)URL.revokeObjectURL(attachment.preview)},[attachment]);
 function choose(file:File){if(file.size>CLASSROOM_IMAGE_MAX_BYTES||!file.size||!['image/png','image/jpeg','image/webp'].includes(file.type)){setError(t('classroomChat.imageInvalid'));return}setError('');receipt.current=null;setAttachment({file,uploadId:crypto.randomUUID(),preview:URL.createObjectURL(file)})}
 async function upload(){if(!attachment)return undefined;if(receipt.current?.uploadId===attachment.uploadId)return receipt.current.imageId;const controller=new AbortController();pending.current=controller;const form=new FormData();form.set('uploadId',attachment.uploadId);form.set('image',attachment.file);const response=await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/classroom/images${shareAccess?'?shareAccess='+encodeURIComponent(shareAccess):''}`,{method:'POST',body:form,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});const body=await response.json();if(!response.ok||!isChatImageId(body.image?.id))throw new Error(t('classroomChat.imageFailed'));receipt.current={uploadId:attachment.uploadId,imageId:body.image.id};return body.image.id}
 function clear(){receipt.current=null;setAttachment(null);setError('')}
 return {attachment,error,setError,choose,upload,clear};
}
