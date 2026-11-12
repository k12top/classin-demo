"use client";
import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {Home,MessageCircle,Users,LayoutGrid,ListTodo,CalendarDays,Folder,Search,Plus,Ellipsis,Globe2,LogOut,HelpCircle,UserCircle,Headphones,ArrowUpRight} from "lucide-react";
import {useTranslation} from "@/lib/i18n/context";
import {useTimeZone} from "@/lib/use-time-zone";
import type {AuthUser} from "@/lib/auth-context";
import {workspaceNextLessonTime,type WorkspacePage,type WorkspaceLesson} from "@/lib/workspace-model";
import {useWorkspaceCopy} from "./workspace-copy";
import styles from "./workspace.module.css";

export function WorkspaceShell({user,page,chatUnread,onNavigate,nextLesson,now,onNextLesson,nextLessonBusy=false,nextLessonState="ready",onSearch,onCreate,onCreateLesson,onJoin,onSettings,onLogout,children,navigation}:{
  user:AuthUser;page:WorkspacePage|null;onNavigate:(page:WorkspacePage)=>void;nextLesson?:WorkspaceLesson;onNextLesson:()=>void;nextLessonBusy?:boolean;onSearch:()=>void;
  nextLessonState?:"ready"|"loading"|"error";chatUnread:number;now:number;onCreate:()=>void;onCreateLesson?:()=>void;onJoin:()=>void;onSettings:(section:"settings"|"account"|"devices"|"about")=>void;onLogout:()=>void;children:ReactNode;navigation?:ReactNode;
}){
  const copy=useWorkspaceCopy(),[menu,setMenu]=useState<"create"|"account"|null>(null),menuRef=useRef<HTMLDivElement>(null);
  const [islandOpen,setIslandOpen]=useState(false),nextDetailsId=useId();
  const pointerInIsland=useRef(false);
  const islandExpanded=islandOpen&&nextLessonState==="ready"&&!nextLessonBusy;
  useEffect(()=>{
    if(!menu)return;
    const outside=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node))setMenu(null);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setMenu(null);};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[menu]);
  const name=user.displayName || user.name;
  const {locale}=useTranslation(),{timeZone}=useTimeZone();
  const nextTime=nextLesson?workspaceNextLessonTime(nextLesson.startTime,now,locale,timeZone):"";
  const availableLesson=nextLessonState==="ready"?nextLesson:undefined;
  const nextLabel=nextLessonBusy||nextLessonState==="loading"?copy.loading:nextLessonState==="error"?copy.failed:availableLesson?copy.nextLesson:copy.noUpcoming;
  const nav=[{id:"home",label:copy.home,Icon:Home},{id:"chat",label:copy.chat,Icon:MessageCircle},...(user.role==="teacher"?[{id:"students",label:copy.students,Icon:Users},{id:"groups",label:copy.groups,Icon:LayoutGrid}]:[]),{id:"todo",label:copy.todo,Icon:ListTodo},{id:"calendar",label:copy.calendar,Icon:CalendarDays},{id:"files",label:copy.files,Icon:Folder}] as const;
  return <div className={styles.shell} data-workspace-shell>
    <header className={styles.topbar} data-workspace-header>
      <div className={styles.quickActions} data-workspace-header-actions>
        <button type="button" className={styles.iconButton} onClick={onSearch} aria-label={copy.globalSearch}><Search size={17}/></button>
        <div className={styles.nextIsland} data-has-lesson={Boolean(availableLesson)} data-expandable={nextLessonState==="ready"} data-expanded={islandExpanded}
          onPointerEnter={()=>{pointerInIsland.current=true;setIslandOpen(true);}} onPointerLeave={event=>{pointerInIsland.current=false;if(!event.currentTarget.contains(document.activeElement))setIslandOpen(false);}}
          onFocus={()=>setIslandOpen(true)} onBlur={event=>{if(!pointerInIsland.current&&!event.currentTarget.contains(event.relatedTarget))setIslandOpen(false);}}
          onKeyDown={event=>{if(event.key==="Escape"&&islandExpanded){event.preventDefault();event.stopPropagation();event.currentTarget.querySelector('button')?.focus();setIslandOpen(false);}}}>
          <button type="button" className={styles.nextClass} aria-expanded={islandExpanded} aria-controls={nextLessonState==="ready"?nextDetailsId:undefined} onClick={()=>availableLesson?onNextLesson():onNavigate("calendar")} title={availableLesson?`${availableLesson.sessionTitle || availableLesson.name} · ${nextTime} · ${timeZone}`:nextLabel} disabled={nextLessonState!=="ready"||nextLessonBusy}><span className={styles.liveDot}/><span className={styles.nextLabel} role="status">{nextLabel}</span>{availableLesson&&!nextLessonBusy&&<><span className={styles.nextTime}>{nextTime}</span><span className={styles.nextEnter}>· {copy.enter}</span></>}</button>
          {availableLesson&&<div id={nextDetailsId} className={styles.nextDetails} aria-hidden={!islandExpanded} inert={!islandExpanded}><span>{copy.nextLesson}</span><strong>{availableLesson.sessionTitle || availableLesson.name}</strong><p>{availableLesson.name}</p><time dateTime={availableLesson.startTime}>{new Intl.DateTimeFormat(locale,{timeZone,dateStyle:"medium",timeStyle:"short"}).format(new Date(availableLesson.startTime))} · {timeZone}</time><button type="button" disabled={nextLessonBusy} onClick={onNextLesson}>{nextLessonBusy?copy.loading:copy.enter} <ArrowUpRight size={14} aria-hidden="true"/></button></div>}{!availableLesson&&nextLessonState==="ready"&&<div id={nextDetailsId} className={styles.nextDetails} aria-hidden={!islandExpanded} inert={!islandExpanded}><span>{copy.calendar}</span><strong>{copy.noUpcoming}</strong><p>{copy.nextHint}</p><button type="button" onClick={()=>onNavigate("calendar")}>{copy.calendar}<ArrowUpRight size={14} aria-hidden="true"/></button></div>}
        </div>
        <div className={styles.menuAnchor} ref={menu==="create"?menuRef:undefined}>
          <button className={styles.createTrigger} type="button" aria-label={copy.quickCreate} aria-expanded={menu==="create"} onClick={()=>setMenu(menu==="create"?null:"create")}><Plus size={19}/></button>
          {menu==="create"&&<div className={styles.menu} role="menu">{user.role==="teacher"&&<>{onCreateLesson&&<button role="menuitem" onClick={()=>{setMenu(null);onCreateLesson();}}><CalendarDays size={15}/>{copy.createLesson}</button>}<button role="menuitem" onClick={()=>{setMenu(null);onCreate();}}><Plus size={15}/>{copy.createClass}</button></>}<button role="menuitem" onClick={()=>{setMenu(null);onJoin();}}><Users size={15}/>{copy.joinPublic}</button></div>}
        </div>
      </div>
    </header>
    <div className={`${styles.frame} ${navigation?styles.wideFrame:""}`}>
      <aside className={styles.navigation} aria-label={copy.brand}>
        {navigation||<><div className={styles.brand} title={copy.brand}>{copy.brand}</div>
        <nav>{nav.map(({id,label,Icon})=><button key={id} type="button" aria-current={page===id?"page":undefined} aria-label={id==="chat"&&chatUnread?`${label} · ${chatUnread}`:undefined} onClick={()=>onNavigate(id as WorkspacePage)}><Icon size={18}/><span>{label}</span>{id==="chat"&&chatUnread>0&&<b className={styles.unreadBadge}>{chatUnread>99?"99+":chatUnread}</b>}</button>)}</nav></>}
        <div className={styles.profile} ref={menu==="account"?menuRef:undefined}>
          <button className={styles.profileButton} type="button" aria-label={`${name} ${copy.account}`} aria-haspopup="menu" aria-expanded={menu==="account"} onClick={()=>setMenu(menu==="account"?null:"account")}>
            <span className={styles.avatar}>{name.slice(0,1)}</span><span className={styles.profileName}><strong>{name}</strong><small>{user.role==="teacher"?copy.teacher:copy.student}</small></span><Ellipsis size={16}/>
          </button>
          {menu==="account"&&<div className={`${styles.menu} ${styles.accountMenu}`} role="menu"><button role="menuitem" onClick={()=>{setMenu(null);onSettings("account");}}><UserCircle size={15}/>{copy.accountInfo}</button><button role="menuitem" onClick={()=>{setMenu(null);onSettings("settings");}}><Globe2 size={15}/>{copy.settings}</button><button role="menuitem" onClick={()=>{setMenu(null);onSettings("devices");}}><Headphones size={15}/>{copy.deviceCheck}</button><button role="menuitem" onClick={()=>{setMenu(null);onSettings("about");}}><HelpCircle size={15}/>{copy.help}</button><button role="menuitem" onClick={()=>{setMenu(null);onLogout();}}><LogOut size={15}/>{copy.logout}</button></div>}
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  </div>;
}
export function WorkspaceSearch({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string}){return <label className={styles.search}><Search size={14}/><input type="search" aria-label={label} placeholder={placeholder||label} value={value} onChange={event=>onChange(event.target.value)}/></label>;}
export function WorkspaceEmpty({title,description,action}:{title:string;description?:string;action?:ReactNode}){return <div className={styles.empty}><Folder size={27} strokeWidth={1.2}/><strong>{title}</strong>{description&&<p>{description}</p>}{action}</div>;}
