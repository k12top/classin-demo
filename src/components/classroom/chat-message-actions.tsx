"use client";
import { ClassroomIconButton } from "./icon-button";
import { useState } from "react";
import { MoreHorizontal,Copy,Trash2,VolumeX,Volume2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import type { ClassroomMessageSnapshot } from "@/lib/classroom/types";
import { DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog,DialogContent,DialogTitle,DialogDescription } from "@/components/ui/dialog";

export function ChatMessageActions({message,canManage,muted,onDelete,onDeleteMember,onMuteMember}:{message:ClassroomMessageSnapshot;canManage:boolean;muted:boolean|undefined;onDelete:(id:string)=>Promise<boolean>|void;onDeleteMember?:(id:string)=>Promise<boolean>|void;onMuteMember?:(id:string,muted:boolean)=>void}){
 const {t}=useTranslation();const [confirm,setConfirm]=useState<'message'|'member'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function remove(){if(busy)return;setBusy(true);setError('');try{const result=confirm==='member'?await onDeleteMember?.(message.senderId):await onDelete(message.id);if(result===false)throw new Error();setConfirm(null)}catch{setError(t('classroom.v3.messageWithdrawFailed'))}finally{setBusy(false)}}
 if(message.kind!=="text"&&!canManage)return null;
 return <><DropdownMenu modal={false}><DropdownMenuTrigger asChild><ClassroomIconButton type="button" title={t('classroomWorkspace.messageOptions')} aria-label={t('classroomWorkspace.messageOptions')}><MoreHorizontal/></ClassroomIconButton></DropdownMenuTrigger><DropdownMenuContent className="classroom-header-menu" align="end" collisionPadding={8}>
 {message.kind==='text'&&<DropdownMenuItem onSelect={()=>{void navigator.clipboard.writeText(message.content).catch(()=>setError(t('classroomChat.copyFailed')))}}><Copy/>{t('classroomChat.copy')}</DropdownMenuItem>}
 {canManage&&<DropdownMenuItem className="is-danger" onSelect={()=>setConfirm('message')}><Trash2/>{t('classroom.v3.withdrawMessage')}</DropdownMenuItem>}
 {canManage&&muted!==undefined&&onDeleteMember&&<DropdownMenuItem className="is-danger" onSelect={()=>setConfirm('member')}><Trash2/>{t('classroomChat.withdrawMember')}</DropdownMenuItem>}
 {canManage&&muted!==undefined&&onMuteMember&&<DropdownMenuItem onSelect={()=>onMuteMember(message.senderId,!muted)}>{muted?<Volume2/>:<VolumeX/>}{t(muted?'classroomChat.unmuteMember':'classroomChat.muteMember')}</DropdownMenuItem>}
 </DropdownMenuContent></DropdownMenu><Dialog open={!!confirm} onOpenChange={open=>{if(!open&&!busy)setConfirm(null)}}><DialogContent><DialogTitle>{t(confirm==='member'?'classroomChat.withdrawMember':'classroom.v3.withdrawMessage')}</DialogTitle><DialogDescription>{t(confirm==='member'?'classroomChat.withdrawMemberConfirm':'classroomChat.withdrawMessageConfirm')}</DialogDescription>{error&&<p role="alert">{error}</p>}<div className="classroom-minimal-confirm"><ClassroomIconButton type="button" disabled={busy} onClick={()=>setConfirm(null)}>{t('common.cancel')}</ClassroomIconButton><ClassroomIconButton type="button" disabled={busy} onClick={()=>void remove()}>{t('common.confirm')}</ClassroomIconButton></div></DialogContent></Dialog>{error&&!confirm&&<span role="alert">{error}</span>}</>;
}
