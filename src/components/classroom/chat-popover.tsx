"use client";
import { ClassroomIconButton } from "./icon-button";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function ChatPopover({ label, icon, children }: { label:string;icon:ReactNode;children:ReactNode }) {
 const root=useRef<HTMLSpanElement>(null);const [open,setOpen]=useState(false);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false);root.current?.querySelector('button')?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true)}},[open]);
 return <span ref={root} className="classroom-chat-popover-anchor"><ClassroomIconButton type="button" className="classroom-chat-management" title={label} aria-label={label} aria-expanded={open} onClick={()=>setOpen(!open)}>{icon}</ClassroomIconButton>{open&&<div className="classroom-chat-popover" role="dialog" aria-label={label}>{children}</div>}</span>;
}
