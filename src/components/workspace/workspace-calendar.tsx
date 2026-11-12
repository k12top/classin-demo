"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {ChevronLeft,ChevronRight,Plus} from "lucide-react";
import {useTranslation} from "@/lib/i18n/context";
import {useTimeZone} from "@/lib/use-time-zone";
import {TimeZoneSelector} from "@/components/time-zone-selector";
import {zonedDateKey,zonedInputValue} from "@/lib/time-zone";
import {workspaceLessons,type WorkspaceCourse,type WorkspaceLesson} from "@/lib/workspace-model";
import {shiftWorkspaceDay,workspaceWeek,workspaceMonth,workspaceDaySegments,workspaceIntervalsByDay,workspaceEventColumns,workspaceConflictRanges,workspaceCalendarDataStatus,workspaceCalendarCourseColor,workspaceCalendarTimeRange,workspaceCalendarInitialScroll} from "@/lib/workspace-calendar";
import {loadWorkspaceTasks,type WorkspaceTask} from "@/lib/workspace-client";
import {watchWorkspaceRefresh} from "@/lib/workspace-refresh";
import {Dialog,DialogContent,DialogDescription,DialogTitle} from "@/components/ui/dialog";
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {CalendarEventForm,loadCalendarEvents,type CalendarEvent} from "./workspace-calendar-event";
import {useWorkspaceCopy} from "./workspace-copy";
import {courseWorkspaceText} from "./course-workspace-copy";
import {workspaceCalendarText} from "./workspace-calendar-copy";
import styles from "./workspace.module.css";
export function WorkspaceCalendar({userId,courses,coursesReady,coursesError,onLesson,onTodo}:{userId:string;courses:WorkspaceCourse[];coursesReady:boolean;coursesError:boolean;onLesson:(lesson:WorkspaceLesson)=>void;onTodo:()=>void}){
  const copy=useWorkspaceCopy(),{locale}=useTranslation(),{timeZone}=useTimeZone();
  const taskLabel=workspaceCalendarText(locale,"待办","To Do"),allDay=workspaceCalendarText(locale,"全天","All day");
  const [tasks,setTasks]=useState<WorkspaceTask[]>([]),[taskError,setTaskError]=useState(false),[tasksLoaded,setTasksLoaded]=useState(false),[taskReload,setTaskReload]=useState(0),[showTasks,setShowTasks]=useState(true);
  const [events,setEvents]=useState<CalendarEvent[]>([]),[eventErrorRange,setEventErrorRange]=useState(""),[eventsLoadedRange,setEventsLoadedRange]=useState(""),[eventReload,setEventReload]=useState(0),[showEvents,setShowEvents]=useState(true),[editingEvent,setEditingEvent]=useState<CalendarEvent|"new"|null>(null),[eventBusy,setEventBusy]=useState(false),[eventDirty,setEventDirty]=useState(false);
  useEffect(()=>{if(!editingEvent||(!eventDirty&&!eventBusy))return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[editingEvent,eventDirty,eventBusy]);
  useEffect(()=>watchWorkspaceRefresh(()=>{setTaskReload(value=>value+1);if(!editingEvent)setEventReload(value=>value+1);}),[editingEvent]);
  useEffect(()=>{const controller=new AbortController();void loadWorkspaceTasks(controller.signal).then(value=>{if(!controller.signal.aborted){setTasks(value);setTasksLoaded(true);setTaskError(false);}}).catch(failure=>{if(!controller.signal.aborted){const status=(failure as {status?:number})?.status;if(status===401||status===403||status===404){setTasks([]);setTasksLoaded(false);}setTaskError(true);}});return()=>controller.abort();},[taskReload]);
  const [selected,setSelected]=useState("1970-01-01"),[month,setMonth]=useState("1970-01-01"),[calendarInitialized,setCalendarInitialized]=useState(false),[courseId,setCourseId]=useState(""),[showClasses,setShowClasses]=useState(true);
  const userChoseDate=useRef(false);
  useEffect(()=>{let active=true;const today=zonedDateKey(new Date(),timeZone);queueMicrotask(()=>{if(active&&!userChoseDate.current){setSelected(today);setMonth(today);setCalendarInitialized(true);}});return()=>{active=false;};},[timeZone]);
  const [now,setNow]=useState<Date|null>(null);
  useEffect(()=>{const update=()=>setNow(new Date());update();const timer=window.setInterval(update,60_000);window.addEventListener("focus",update);return()=>{window.clearInterval(timer);window.removeEventListener("focus",update);};},[]);
  const wallNow=now?zonedInputValue(now,timeZone):null;
  const currentDay=wallNow?.slice(0,10),currentMinute=wallNow?Number(wallNow.slice(11,13))*60+Number(wallNow.slice(14,16)):0;
  const scroll=useRef<HTMLDivElement>(null);
  const visibleTasks=courseId?tasks.filter(task=>task.courseId===courseId):tasks;
  const lessons=useMemo(()=>workspaceLessons(courses).filter(lesson=>(!courseId || lesson.id===courseId)&&showClasses),[courses,courseId,showClasses]);
  const week=useMemo(()=>workspaceWeek(selected),[selected]),days=useMemo(()=>workspaceMonth(month),[month]),hours=Array.from({length:24},(_,index)=>index);
  const dayKeys=useMemo(()=>[...new Set([...days,...week,selected])],[days,week,selected]);
  const lessonsByDay=useMemo(()=>workspaceIntervalsByDay(lessons,dayKeys,timeZone,lesson=>({start:lesson.startTime,end:lesson.endTime})),[lessons,dayKeys,timeZone]);
  const eventsByDay=useMemo(()=>workspaceIntervalsByDay(showEvents?events:[],dayKeys,timeZone,event=>({start:event.startsAt,end:event.endsAt})),[events,showEvents,dayKeys,timeZone]);
  const monthStart=days[0],monthEnd=days[days.length-1],weekStart=week[0],weekEnd=week[week.length-1];
  const rangeKey=`${monthStart}:${monthEnd}:${weekStart}:${weekEnd}`;
  useEffect(()=>{if(!calendarInitialized)return;const controller=new AbortController();
    const range=(start:string,end:string)=>loadCalendarEvents(`${shiftWorkspaceDay(start,-2)}T00:00:00Z`,`${shiftWorkspaceDay(end,3)}T00:00:00Z`,controller.signal).catch(failure=>{
      const status=(failure as {status?:number})?.status;
      if(!controller.signal.aborted&&(status===401||status===403||status===404)){
        setEvents([]);setEventsLoadedRange("");setEventErrorRange(rangeKey);controller.abort();
      }
      throw failure;
    });
    void Promise.allSettled([range(monthStart,monthEnd),range(weekStart,weekEnd)]).then(results=>{
      const failures=results.filter((result):result is PromiseRejectedResult=>result.status==="rejected");
      if(failures.length){const denied=failures.find(result=>{const status=(result.reason as {status?:number})?.status;return status===401||status===403||status===404;});throw (denied||failures[0]).reason;}
      const [monthEvents,weekEvents]=results.map(result=>(result as PromiseFulfilledResult<CalendarEvent[]>).value);if(!controller.signal.aborted){setEvents([...new Map([...monthEvents,...weekEvents].map(event=>[event.id,event])).values()]);setEventsLoadedRange(rangeKey);setEventErrorRange("");}}).catch(failure=>{if(!controller.signal.aborted){const status=(failure as {status?:number})?.status;if(status===401||status===403||status===404){setEvents([]);setEventsLoadedRange("");}setEventErrorRange(rangeKey);}});return()=>controller.abort();
  },[calendarInitialized,monthStart,monthEnd,weekStart,weekEnd,rangeKey,eventReload]);
  const eventError=eventErrorRange===rangeKey;
  const dayDataStatus=workspaceCalendarDataStatus([{visible:showClasses,ready:coursesReady,failed:coursesError},{visible:showTasks,ready:tasksLoaded,failed:taskError},{visible:showEvents,ready:eventsLoadedRange===rangeKey,failed:eventError}]);
  const dateLabel=(day:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat(locale,{...options,timeZone:"UTC"}).format(new Date(`${day}T12:00:00Z`));
  const monthTitle=dateLabel(month,{month:"long",year:"numeric"});
  const moveMonth=(delta:number)=>{userChoseDate.current=true;const date=new Date(`${month.slice(0,7)}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+delta);setMonth(date.toISOString().slice(0,10));};
  const choose=(day:string)=>{userChoseDate.current=true;setSelected(day);setMonth(day);};
  const selectedLessons=lessonsByDay.get(selected)||[];
  const selectedEvents=eventsByDay.get(selected)||[];
  const selectedTimed=[...selectedLessons.map(lesson=>({kind:"lesson" as const,at:lesson.startTime,lesson})),...selectedEvents.map(event=>({kind:"event" as const,at:event.startsAt,event}))].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const selectedTasks=showTasks?visibleTasks.filter(task=>!task.completed&&task.dueDate===selected):[];
  const range=(start:string,end:string|null)=>workspaceCalendarTimeRange(start,end,locale,timeZone);
  const weekSegments=useMemo(()=>new Map(week.map(day=>{
    const lessonParts=(lessonsByDay.get(day)||[]).flatMap(lesson=>workspaceDaySegments(lesson.startTime,lesson.endTime,day,timeZone).map(segment=>({lesson,segment,key:`lesson:${lesson.scheduleId}:${segment.index}`})));
    const eventParts=(eventsByDay.get(day)||[]).flatMap(event=>workspaceDaySegments(event.startsAt,event.endsAt,day,timeZone).map(segment=>({event,segment,key:`event:${event.id}:${segment.index}`})));
    const columns=workspaceEventColumns([...lessonParts,...eventParts].map(part=>({key:part.key,...part.segment})));
    const conflicts=workspaceConflictRanges([...lessonParts,...eventParts].map(part=>part.segment));
    return [day,{lessonParts,eventParts,columns,conflicts}] as const;
  })),[week,lessonsByDay,eventsByDay,timeZone]);
  // Wait for the selected day’s sources so a late response does not pull the
  // timeline away after the user has started exploring it.
  const autoScrollKey=JSON.stringify([selected,timeZone]);
  const positioned=useRef(""),manuallyScrolled=useRef(""),lastSelection=useRef("");
  useEffect(()=>{
    if(lastSelection.current!==autoScrollKey){lastSelection.current=autoScrollKey;positioned.current="";if(manuallyScrolled.current!==autoScrollKey)manuallyScrolled.current="";}
    if(!calendarInitialized||!scroll.current||positioned.current===autoScrollKey||manuallyScrolled.current===autoScrollKey)return;
    if(showClasses&&!coursesReady&&!coursesError||showEvents&&eventsLoadedRange!==rangeKey&&!eventError)return;
    const segments=weekSegments.get(selected);
    const starts=segments?[...segments.lessonParts,...segments.eventParts].map(part=>part.segment.start):[];
    scroll.current.scrollTo({top:workspaceCalendarInitialScroll(starts)});
    positioned.current=autoScrollKey;
  },[autoScrollKey,calendarInitialized,coursesError,coursesReady,eventError,eventsLoadedRange,rangeKey,selected,showClasses,showEvents,weekSegments]);
  const keepManualScroll=()=>{manuallyScrolled.current=autoScrollKey;};

  if(!calendarInitialized)return <p role="status" className={styles.subtle}>{copy.loading}</p>;
  return <div className={styles.calendarLayout}>
    <aside className={styles.miniCalendar}><h1>{copy.calendar}</h1><div className={styles.monthToolbar}><strong>{monthTitle}</strong><button className={styles.iconButton} type="button" aria-label={copy.previous} onClick={()=>moveMonth(-1)}><ChevronLeft size={14}/></button><button className={styles.iconButton} type="button" aria-label={copy.next} onClick={()=>moveMonth(1)}><ChevronRight size={14}/></button></div>
      <div className={styles.monthGrid}>{workspaceWeek("2026-11-02").map(day=><span key={day}>{dateLabel(day,{weekday:"narrow"})}</span>)}{days.map(day=>{const count=lessonsByDay.get(day)?.length||0,taskCount=showTasks?visibleTasks.filter(task=>!task.completed&&task.dueDate===day).length:0,eventCount=eventsByDay.get(day)?.length||0;return <button type="button" key={day} aria-label={`${dateLabel(day,{month:"long",day:"numeric"})}${count?` · ${count} ${copy.lesson}`:""}${taskCount?` · ${taskCount} ${taskLabel}`:""}${eventCount?` · ${eventCount} ${workspaceCalendarText(locale,"个人日程","personal events")}`:""}`} aria-pressed={selected===day} data-outside={day.slice(0,7)!==month.slice(0,7)} onClick={()=>choose(day)}>{Number(day.slice(-2))}{count+taskCount+eventCount>0&&<i/>}</button>;})}</div>
      <label className={styles.checkLabel}><input type="checkbox" checked={showClasses} onChange={event=>setShowClasses(event.target.checked)}/>{copy.schedule}</label>
      <label className={styles.checkLabel}><input type="checkbox" checked={showTasks} onChange={event=>setShowTasks(event.target.checked)}/>{taskLabel}</label><label className={styles.checkLabel}><input type="checkbox" checked={showEvents} onChange={event=>setShowEvents(event.target.checked)}/>{workspaceCalendarText(locale,"个人日程","Personal events")}</label>
      {taskError&&<div className={styles.error} role="alert">{workspaceCalendarText(locale,"无法同步待办","Unable to sync tasks")}<button type="button" onClick={()=>setTaskReload(value=>value+1)}>{copy.retry}</button></div>}
      {eventError&&<div className={styles.error} role="alert">{workspaceCalendarText(locale,"无法同步个人日程","Unable to sync personal events")}<button type="button" onClick={()=>setEventReload(value=>value+1)}>{copy.retry}</button></div>}
      <h2>{dateLabel(selected,{month:"short",day:"numeric"})}</h2>{selectedTasks.map(task=><button type="button" className={styles.dayLesson} key={`task:${task.id}`} onClick={onTodo}><time>{allDay} · {taskLabel}</time><strong>{task.title}</strong></button>)}{selectedTimed.map(item=>item.kind==="lesson"?<button type="button" className={styles.dayLesson} key={`lesson:${item.lesson.scheduleId}`} onClick={()=>onLesson(item.lesson)}><time>{range(item.lesson.startTime,item.lesson.endTime)}</time><strong>{item.lesson.sessionTitle || item.lesson.name}</strong><small>{item.lesson.name}</small></button>:<button type="button" className={styles.dayLesson} key={`event:${item.event.id}`} onClick={()=>setEditingEvent(item.event)}><time>{range(item.event.startsAt,item.event.endsAt)} · {workspaceCalendarText(locale,"个人日程","Personal")}</time><strong>{item.event.title}</strong></button>)}{!selectedTimed.length&&!selectedTasks.length&&(dayDataStatus==="ready"?<p className={styles.subtle}>{copy.noLessons}</p>:dayDataStatus==="loading"?<p role="status" className={styles.subtle}>{copy.loading}</p>:null)}
    </aside>
    <section className={styles.weekCalendar}><header className={styles.weekToolbar}><h1>{dateLabel(selected,{year:"numeric",month:"long"})}</h1><button type="button" className={styles.iconButton} aria-label={copy.previous} onClick={()=>choose(shiftWorkspaceDay(selected,-7))}><ChevronLeft size={15}/></button><button type="button" className={styles.button} onClick={()=>choose(zonedDateKey(new Date(),timeZone))}>{copy.today}</button><button type="button" className={styles.iconButton} aria-label={copy.next} onClick={()=>choose(shiftWorkspaceDay(selected,7))}><ChevronRight size={15}/></button><button type="button" className={styles.button} onClick={()=>setEditingEvent("new")}><Plus size={14}/>{workspaceCalendarText(locale,"新建日程","New event")}</button><div className={styles.weekToolbarEnd}><TimeZoneSelector/><select aria-label={copy.filter} value={courseId} onChange={event=>setCourseId(event.target.value)}><option value="">{copy.allLessons}</option>{courses.map(course=><option key={course.id} value={course.id}>{course.name}</option>)}</select></div></header>
      <div className={styles.weekDates}><span>{copy.week}</span>{week.map(day=><button type="button" key={day} aria-pressed={selected===day} onClick={()=>choose(day)}><small>{dateLabel(day,{weekday:"short"})}</small><strong>{Number(day.slice(-2))}</strong></button>)}</div>
      {showTasks&&<div className={styles.calendarAllDay}><span>{allDay}</span>{week.map(day=><div key={day}>{visibleTasks.filter(task=>!task.completed&&task.dueDate===day).map(task=><button key={task.id} type="button" onClick={onTodo} title={`${taskLabel}: ${task.title}`}>{task.title}</button>)}</div>)}</div>}
      <div className={styles.timelineScroll} ref={scroll} onWheel={keepManualScroll} onTouchStart={keepManualScroll} onPointerDown={keepManualScroll} onKeyDown={keepManualScroll}><div className={styles.timeline}><div className={styles.hourColumn}>{hours.map(hour=><span key={hour} style={{top:hour*52}}>{String(hour).padStart(2,"0")}:00</span>)}</div>{week.map(day=>{const {columns,conflicts,lessonParts,eventParts}=weekSegments.get(day)!;return <div key={day} className={styles.dayColumn} aria-label={dateLabel(day,{dateStyle:"full"})}>{hours.map(hour=><i key={hour} style={{top:hour*52}}/>)}{day===currentDay&&<span className={styles.currentTime} style={{top:currentMinute/60*52}} aria-hidden="true"/>}{conflicts.map((conflict,index)=>{const parts=[...lessonParts,...eventParts];const involved=parts.filter(part=>parts.some(other=>other!==part&&other.segment.offset===part.segment.offset&&Math.max(part.segment.start,other.segment.start,conflict.start)<Math.min(part.segment.end,other.segment.end,conflict.end)));const unique=[...new Map(involved.map(part=>["lesson" in part?`lesson:${part.lesson.scheduleId}`:`event:${part.event.id}`,part])).values()];return <DropdownMenu key={`conflict:${index}`}><DropdownMenuTrigger asChild><button type="button" className={styles.calendarConflict} style={{top:conflict.start/60*52,height:(conflict.end-conflict.start)/60*52}} aria-label={`${dateLabel(day,{dateStyle:"full"})} · ${workspaceCalendarText(locale,"时间冲突，选择安排","Time conflict, choose an event")}`} title={workspaceCalendarText(locale,"时间冲突，选择安排","Time conflict, choose an event")}/></DropdownMenuTrigger><DropdownMenuContent className={styles.calendarConflictMenu} align="start">{unique.map(part=>"lesson" in part?<DropdownMenuItem key={part.key} onSelect={()=>{choose(day);onLesson(part.lesson);}}><strong>{part.lesson.sessionTitle||part.lesson.name}</strong><small>{range(part.lesson.startTime,part.lesson.endTime)}</small></DropdownMenuItem>:<DropdownMenuItem key={part.key} onSelect={()=>{choose(day);setEditingEvent(part.event);}}><strong>{part.event.title}</strong><small>{range(part.event.startsAt,part.event.endsAt)}</small></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;})}{lessonParts.map(({lesson,segment,key})=><button type="button" key={key} className={styles.calendarEvent} data-overlap={(columns.get(key)?.columns||1)>1} data-color={workspaceCalendarCourseColor(lesson.id)} data-past={["finished","ended","cancelled"].includes(lesson.status)} style={{top:segment.start/60*52,height:Math.max(31,(segment.end-segment.start)/60*52-3)}} onClick={()=>onLesson(lesson)} title={`${lesson.sessionTitle || lesson.name} · ${range(lesson.startTime,lesson.endTime)}`}><strong>{lesson.sessionTitle || lesson.name}{segment.split&&` · ${segment.offset}`}</strong><small>{lesson.name}</small></button>)}{eventParts.map(({event,segment,key})=><button type="button" key={key} className={`${styles.calendarEvent} ${styles.personalEvent}`} data-overlap={(columns.get(key)?.columns||1)>1} style={{top:segment.start/60*52,height:Math.max(31,(segment.end-segment.start)/60*52-3)}} onClick={()=>setEditingEvent(event)} title={`${event.title} · ${range(event.startsAt,event.endsAt)}`}><strong>{event.title}{segment.split&&` · ${segment.offset}`}</strong></button>)}</div>;})}</div></div><footer className={styles.calendarFooter}>{copy.selectLesson}<span>{timeZone}</span></footer>
    </section>
    <Dialog open={editingEvent!==null} onOpenChange={open=>{if(!open&&!eventBusy&&(!eventDirty||window.confirm(courseWorkspaceText(locale,"当前编辑尚未保存，关闭后内容将丢失。确定关闭吗？","Your changes are not saved. Close and discard them?")))){setEventDirty(false);setEditingEvent(null);setEventReload(value=>value+1);}}}><DialogContent className={styles.dialog}><DialogTitle>{editingEvent==="new"?(workspaceCalendarText(locale,"新建个人日程","New personal event")):(workspaceCalendarText(locale,"编辑个人日程","Edit personal event"))}</DialogTitle><DialogDescription className={styles.srOnly}>{workspaceCalendarText(locale,"个人日程","Personal event")}</DialogDescription>{editingEvent&&<CalendarEventForm key={editingEvent==="new"?"new":editingEvent.id} event={editingEvent==="new"?undefined:editingEvent} day={selected} timeZone={timeZone} userId={userId} locale={locale} onBusyChange={setEventBusy} onDirtyChange={setEventDirty} onSaved={()=>{setEventDirty(false);setEditingEvent(null);setEventReload(value=>value+1);}}/>}</DialogContent></Dialog>
  </div>;
}
