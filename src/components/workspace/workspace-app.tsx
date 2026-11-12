"use client";
import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore,type FormEvent,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {BookOpen,CalendarDays,ChevronRight,MessageCircle,Users} from "lucide-react";
import {useAuth,type AuthUser} from "@/lib/auth-context";
import {useTranslation} from "@/lib/i18n/context";
import {useTimeZone} from "@/lib/use-time-zone";
import {TimeZoneSelector,SchedulingTimeZone,ScheduleTimePreview} from "@/components/time-zone-selector";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import {WorkspaceGroups} from "./workspace-groups";
import {WorkspaceStudentDetail} from "./workspace-student-detail";
import {parseZonedInput,zonedInputValue} from "@/lib/time-zone";
import {classroomVerifyAccessPath} from "@/lib/classroom/entry-path";
import {openClassroomWindow,reserveClassroomWindow} from "@/lib/classroom/open-desktop-window";
import {courseWorkspacePath,scheduledPlaybackPath,type CourseWorkspaceSection} from "@/lib/course-schedule";
import {workspaceRequest} from "@/lib/workspace-client";
import {createWorkspaceGroupLoader} from "@/lib/workspace-group-loader";
import {pendingClassKey,parsePendingClass,type PendingClass} from "@/lib/workspace-class-pending";
import {retryIdempotentWrite,UncertainWriteError} from "@/lib/workspace-idempotent-write";
import {searchWorkspace} from "@/lib/workspace-search";
import {flattenWorkspaceGroups,workspaceLessons,filterWorkspaceStudents,refreshedWorkspaceLesson,schedulableWorkspaceCourses,upcomingLessons,workspaceStudents,workspaceStudentSelection,workspacePage,type WorkspaceCourse,type WorkspaceGroup,type WorkspaceLesson,type WorkspacePage} from "@/lib/workspace-model";
import {WorkspaceShell,WorkspaceEmpty,WorkspaceSearch} from "./workspace-shell";
import {WorkspaceHome} from "./workspace-home";
import {WorkspaceSearchStatus,searchSourcesIncomplete,type SearchSources} from "./workspace-search-status";
import {searchWorkspaceFunctions} from "@/lib/workspace-function-search";
import {workspaceSearchCopy} from "./workspace-search-copy";
import {WorkspaceFunctionResults} from "./workspace-function-results";
import {WorkspaceTodo} from "./workspace-todo";
import {WorkspaceChat} from "./workspace-chat";
import {useWorkspaceFileSearch,type WorkspaceSearchFile} from "./use-workspace-file-search";
import {WorkspaceFileSearchResults} from "./workspace-file-search-results";
import {WorkspaceFilePreview} from "./workspace-file-preview";
import {workspacePreviewable} from "@/lib/workspace-preview-kind";
import {WorkspaceDrive} from "./workspace-drive";
import {useChatUnread} from "./use-chat-unread";
import {useDirectChats} from "./use-direct-chats";
import {WorkspaceCalendar} from "./workspace-calendar";
import {WorkspaceDeviceCheck} from "./workspace-device-check";
import {useTranslationPreference} from "./use-translation-preference";
import {useWorkspaceCopy} from "./workspace-copy";
import {workspaceClassCreationCopy} from "./workspace-class-creation-copy";
import styles from "./workspace.module.css";

const routeEvent="classroom:workspace-navigation";
function subscribeRoute(callback:()=>void){window.addEventListener("popstate",callback);window.addEventListener(routeEvent,callback);return()=>{window.removeEventListener("popstate",callback);window.removeEventListener(routeEvent,callback);};}
function currentPage(){return workspacePage(new URLSearchParams(window.location.search).get("view"));}
function currentChatCourse(){return new URLSearchParams(window.location.search).get("courseId") || "";}
function currentStudent(){return new URLSearchParams(window.location.search).get("studentId") || "";}
function currentDirect(){return new URLSearchParams(window.location.search).get("directId") || "";}
function currentGroup(){return new URLSearchParams(window.location.search).get("groupId") || "";}
export function WorkspaceApp({courses,user,refresh,error,offline,refreshing,children,navigation}:{courses:WorkspaceCourse[];user:AuthUser;refresh:()=>void;error?:string;offline?:boolean;refreshing?:boolean;children?:ReactNode;navigation?:ReactNode}){
  const router=useRouter(),{logout}=useAuth(),{locale}=useTranslation(),{timeZone}=useTimeZone(),copy=useWorkspaceCopy();
  const [translationPreference,setTranslationPreference]=useTranslationPreference(user.userId);
  const requested=useSyncExternalStore(subscribeRoute,currentPage,()=>"home" as WorkspacePage);
  const chatCourse=useSyncExternalStore(subscribeRoute,currentChatCourse,()=>"");
  const requestedStudent=useSyncExternalStore(subscribeRoute,currentStudent,()=>"");
  const requestedDirect=useSyncExternalStore(subscribeRoute,currentDirect,()=>"");
  const requestedGroup=useSyncExternalStore(subscribeRoute,currentGroup,()=>"");
  const page=user.role!=="teacher"&&["students","groups"].includes(requested)?"home":requested;
  const [dialog,setDialog]=useState<"create"|"createLesson"|"join"|"settings"|"account"|"devices"|"about"|"search"|null>(null),[dialogBusy,setDialogBusy]=useState(false),[lesson,setLesson]=useState<WorkspaceLesson|null>(null);
  const [groups,setGroups]=useState<WorkspaceGroup[]>([]),[groupError,setGroupError]=useState(""),[groupsLoaded,setGroupsLoaded]=useState(false),[actionError,setActionError]=useState(""),[entering,setEntering]=useState(false),[query,setQuery]=useState(""),[studentSelection,setStudentSelection]=useState<{id:string;source:string}|null>(null);
  useEffect(()=>{if(refreshing||error||entering)return;let active=true;queueMicrotask(()=>{if(active)setLesson(current=>refreshedWorkspaceLesson(current,courses));});return()=>{active=false;};},[courses,error,refreshing,entering]);
  const [now,setNow]=useState<number>(()=>0);
  useEffect(()=>{const tick=()=>setNow(Date.now());queueMicrotask(tick);const timer=setInterval(tick,30_000);return()=>clearInterval(timer);},[]);
  const fileSearch=useWorkspaceFileSearch(query,user.userId,dialog==="search");
  const [searchFile,setSearchFile]=useState<WorkspaceSearchFile|null>(null);
  const groupLoader=useMemo(()=>createWorkspaceGroupLoader(result=>{setGroups(result);setGroupsLoaded(true);setGroupError("");},denied=>{if(denied){setGroups([]);setGroupsLoaded(false);}setGroupError(denied?"denied":"unavailable");}),[]);
  useEffect(()=>()=>groupLoader.invalidate(),[groupLoader]);
  const loadGroups=useCallback(async()=>user.role==="teacher"?groupLoader.load():false,[user.role,groupLoader]);
  useEffect(()=>{let active=true;if(page==="students" || page==="groups" || dialog==="search")queueMicrotask(()=>{if(active)void loadGroups();});return()=>{active=false;};},[page,dialog,loadGroups]);
  const students=useMemo(()=>groupError==="denied"?[]:workspaceStudents(courses,groups,user.userId),[courses,groups,user.userId,groupError]);
  const peopleFailure=groupError==="denied"?(locale==="zh-TW"?"無法存取學生與分組，請重新登入或確認權限。":locale.startsWith("zh")?"无法访问学生与分组，请重新登录或确认权限。":locale==="vi"?"Không thể truy cập học sinh và nhóm. Hãy đăng nhập lại hoặc kiểm tra quyền.":"Unable to access students and groups. Sign in again or check access."):copy.failed;
  const studentsReady=groupsLoaded&&!error&&!(refreshing&&!courses.length),studentsWaiting=!studentsReady&&!groupError&&!error;
  const filteredStudents=filterWorkspaceStudents(students,groups,query);
  const selectedStudent=studentSelection?.source===requestedStudent?studentSelection.id:requestedStudent;
  const student=workspaceStudentSelection(filteredStudents,selectedStudent,query);
  const next=useMemo(()=>now?upcomingLessons(courses,now)[0]:undefined,[courses,now]);
  const {counts:unread,previews:chatPreviews}=useChatUnread(courses.map(course=>course.id));
  const direct=useDirectChats();
  const searchCopy=workspaceSearchCopy(locale);
  const searchSources:SearchSources={classes:{loading:Boolean(refreshing),error:Boolean(error)},students:{loading:user.role==="teacher"&&!groupsLoaded&&!groupError,error:user.role==="teacher"&&Boolean(groupError)},chats:{loading:direct.loading,error:direct.error}};
  useEffect(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"&&!event.altKey&&!dialogBusy){event.preventDefault();setQuery("");setDialog("search");}};window.addEventListener("keydown",shortcut);return()=>window.removeEventListener("keydown",shortcut);},[dialogBusy]);
  const navigate=(target:WorkspacePage)=>{if(children){router.push(`/?view=${encodeURIComponent(target)}`);return;}const url=new URL(window.location.href);url.searchParams.set("view",target);url.searchParams.delete("courseId");url.searchParams.delete("directId");url.searchParams.delete("studentId");url.searchParams.delete("groupId");window.history.pushState(null,"",url.pathname+url.search);window.dispatchEvent(new Event(routeEvent));setQuery("");setActionError("");};
  const navigateTarget=(target:"students"|"chat"|"groups",key:"studentId"|"courseId"|"directId"|"groupId",id:string)=>{const params=new URLSearchParams({view:target,[key]:id});if(key==="studentId")setStudentSelection({id,source:id});setQuery("");setActionError("");if(children){router.push(`/?${params}`);return;}window.history.pushState(null,"",`/?${params}`);window.dispatchEvent(new Event(routeEvent));};
  const openCourse=(course:WorkspaceCourse,section?:CourseWorkspaceSection)=>router.push(courseWorkspacePath(course.id,null,section));
  const openLesson=(value:WorkspaceLesson)=>{setActionError("");setLesson(value);};
  const enter=async(value:WorkspaceLesson)=>{
    if(entering)return;setEntering(true);setActionError("");
    let child:Window|null=null,opened=false;
    try{
      child=reserveClassroomWindow();
      const result=await workspaceRequest<{allowed:boolean;classroomUrl?:string;reason?:string}>(classroomVerifyAccessPath(value.id,value.sessionId));
      if(!result.allowed || !result.classroomUrl)throw new Error(result.reason || copy.failed);
      const target=new URL(result.classroomUrl,window.location.origin);
      if(target.origin!==window.location.origin || target.pathname!=="/classroom")throw new Error(copy.failed);
      opened=await openClassroomWindow(target,child);if(!opened)router.push(target.pathname+target.search);
    }catch(failure){setActionError(failure instanceof Error&&failure.name!=="AbortError"?failure.message:copy.failed);refresh();}finally{if(!opened)child?.close();setEntering(false);}
  };
  const showDialog=(value:typeof dialog)=>{setActionError("");setQuery("");setDialog(value);};
  return <WorkspaceShell user={user} page={children?null:page} navigation={navigation} chatUnread={Object.values(unread).reduce((sum,count)=>sum+count,0)+direct.chats.reduce((sum,chat)=>sum+chat.unread,0)} onNavigate={navigate} nextLesson={next} now={now} onNextLesson={()=>{if(next)void enter(next);}} nextLessonBusy={entering} nextLessonState={error&&!offline?"error":!now||(refreshing&&!courses.length)?"loading":"ready"} onSearch={()=>showDialog("search")} onCreate={()=>showDialog("create")} onCreateLesson={()=>showDialog("createLesson")} onJoin={()=>showDialog("join")} onSettings={showDialog} onLogout={()=>void logout()}>
    {(error || actionError)&&<div className={styles.error} role="alert"><span>{actionError || (offline?(locale==="zh-TW"?"目前離線，顯示最近儲存的課程；請連線後重新整理。":locale.startsWith("zh")?"当前离线，显示最近保存的课程；请联网后刷新。":locale.startsWith("vi")?"Đang ngoại tuyến, hiển thị các lớp đã lưu. Hãy làm mới khi có mạng.":"Offline: showing saved classes. Refresh when connected."):copy.failed)}</span><button type="button" onClick={()=>{setActionError("");refresh();}}>{copy.retry}</button></div>}
    {refreshing&&<span className={styles.syncStatus} role="status">{copy.syncing}</span>}
    {children||<>{page==="home"&&<WorkspaceHome courses={courses} coursesReady={!refreshing&&!error} coursesLoading={Boolean(refreshing)} userId={user.userId} isTeacher={user.role==="teacher"} onOpenCourse={openCourse} onCreate={()=>showDialog("create")} onLesson={openLesson} onReplay={lesson=>router.push(scheduledPlaybackPath(lesson.id,lesson.sessionId))} onTodo={()=>navigate("todo")} now={now}/>}
    {page==="calendar"&&<WorkspaceCalendar key={user.userId} userId={user.userId} courses={courses} coursesReady={!error&&(!refreshing||courses.length>0)} coursesError={Boolean(error)} onLesson={openLesson} onTodo={()=>navigate("todo")}/>}
    {page==="students"&&<div className={styles.directory}>
      <section className={styles.peopleList}><header><h1>{copy.students}<small>{studentsReady?students.length:"–"}</small></h1><WorkspaceSearch label={copy.searchPeople} value={query} onChange={setQuery}/></header>{groupError&&<div className={styles.error} role="alert">{peopleFailure}<button type="button" onClick={()=>void loadGroups()}>{copy.retry}</button></div>}<div className={styles.peopleScroll}>{filteredStudents.map(person=><button type="button" key={person.id} aria-pressed={student?.id===person.id} onClick={()=>setStudentSelection({id:person.id,source:requestedStudent})}><span className={styles.avatar}>{person.name.slice(0,1)}</span><span><strong>{person.name}</strong><small>{person.id}</small></span><ChevronRight size={14}/></button>)}{!filteredStudents.length&&(studentsReady?<WorkspaceEmpty title={copy.noStudents}/>:studentsWaiting?<p role="status" className={styles.subtle}>{copy.loading}</p>:null)}</div></section>
      {student&&studentsReady?<WorkspaceStudentDetail key={student.id} student={student} courses={courses} groups={groups} onCourse={openCourse} onGroup={id=>navigateTarget("groups","groupId",id)} onChat={chat=>{direct.remember(chat);navigateTarget("chat","directId",chat.id);void direct.refresh().catch(()=>{});}} reloadGroups={async()=>{if(!await loadGroups())throw new Error("Unable to refresh groups");refresh();}}/>:<section className={styles.personDetail}>{studentsReady?<WorkspaceEmpty title={copy.noStudents}/>:<p role={studentsWaiting?"status":"alert"} className={styles.subtle}>{studentsWaiting?copy.loading:peopleFailure}</p>}</section>}
    </div>}
    {page==="groups"&&<WorkspaceGroups key={requestedGroup} initialGroupId={requestedGroup} groups={groups} loaded={groupsLoaded} courses={courses} error={groupError} reload={async()=>{if(!await loadGroups())throw new Error("Unable to refresh groups");}} refreshCourses={refresh} onCourse={openCourse}/>}
    {page==="todo"&&<WorkspaceTodo key={user.userId} userId={user.userId} courses={courses} coursesReady={!refreshing&&!error} onOpenCourse={openCourse} onDraft={(draft)=>router.push(courseWorkspacePath(draft.courseId,null,null,draft.id))} onReview={(task)=>router.push(courseWorkspacePath(task.courseId,null,null,null,task.id))} onAssignment={(task)=>router.push(courseWorkspacePath(task.courseId,null,null,null,null,task.id))} onLesson={openLesson} isTeacher={user.role==="teacher"}/>}
    {page==="chat"&&<WorkspaceChat key={`${user.userId}:${chatCourse || ""}:${requestedDirect}`} initialCourseId={chatCourse} initialDirectId={requestedDirect} courses={courses} userId={user.userId} unread={unread} previews={chatPreviews} directChats={direct.chats} directLoading={direct.loading} directError={direct.error} onRefreshDirect={()=>void direct.refresh().catch(()=>{})} onDirectOpened={chat=>{direct.remember(chat);void direct.refresh().catch(()=>{});}} onCourse={openCourse} onLesson={openLesson} now={now}/>}
    {page==="files"&&<WorkspaceDrive key={user.userId}/>}</>}
    <Dialog open={dialog!==null} onOpenChange={open=>{if(!open&&!dialogBusy)setDialog(null);}}><DialogContent className={dialog==="search"?`${styles.dialog} ${styles.spotlight}`:styles.dialog} overlayClassName={dialog==="search"?styles.spotlightOverlay:undefined} onKeyDown={event=>{if(dialog!=="search"||!['ArrowDown','ArrowUp'].includes(event.key))return;const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-search-result]')];if(!buttons.length)return;event.preventDefault();const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[index<0?(event.key==='ArrowDown'?0:buttons.length-1):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}}><DialogTitle className={dialog==="search"?styles.srOnly:undefined}>{dialog==="create"?copy.createClass:dialog==="createLesson"?copy.createLesson:dialog==="join"?copy.joinPublic:dialog==="settings"?copy.settings:dialog==="account"?copy.accountInfo:dialog==="devices"?copy.deviceCheck:dialog==="search"?copy.globalSearch:copy.help}</DialogTitle><DialogDescription className={styles.srOnly}>{dialog==="search"?copy.globalSearch:dialog==="createLesson"?copy.selectClass:copy.account}</DialogDescription>
      {dialog==="create"&&<CreateClass key={user.userId} userId={user.userId} onBusy={setDialogBusy} onDiscard={()=>{setDialog(null);refresh();}} onCreated={course=>{setDialog(null);refresh();openCourse(course);}}/>}
      {dialog==="createLesson"&&<div className={styles.searchResults}>{error&&!offline?<p role="alert">{copy.failed}</p>:refreshing&&!courses.length?<p role="status">{copy.loading}</p>:schedulableWorkspaceCourses(courses,user.userId).length?schedulableWorkspaceCourses(courses,user.userId).map(course=><button key={course.id} type="button" onClick={()=>{setDialog(null);const path=courseWorkspacePath(course.id,null,null,null,null,null,true);if(window.location.pathname===path.split("?")[0])window.dispatchEvent(new CustomEvent("classroom:quick-schedule",{detail:course.id}));else router.push(path);}}><BookOpen size={16}/><span>{course.name}</span><ChevronRight size={14}/></button>):<p>{locale==="zh-TW"?"沒有可排課的班級，請先新增班級。":locale.startsWith("zh")?"没有可排课的班级，请先新建班级。":locale.startsWith("vi")?"Không có lớp phù hợp. Hãy tạo lớp trước.":"No class available for scheduling. Create a class first."}</p>}</div>}
      {dialog==="join"&&<JoinPublic onNavigate={path=>{setDialog(null);router.push(path);}}/>}
      {dialog==="account"&&<div className={styles.accountInfo}><span className={styles.avatar}>{(user.displayName||user.name).slice(0,1)}</span><strong>{user.displayName||user.name}</strong><span>{user.role==="teacher"?copy.teacher:copy.student}</span>{user.email&&<span>{user.email}</span>}</div>}
      {dialog==="devices"&&<WorkspaceDeviceCheck locale={locale}/>}
      {dialog==="settings"&&<div className={styles.settings}><label>{copy.language}<LanguageSwitcher/></label><label>{copy.timeZone}<TimeZoneSelector/></label><label className={styles.checkLabel}><input type="checkbox" checked={translationPreference.enabled} onChange={event=>setTranslationPreference({...translationPreference,enabled:event.target.checked})}/>{copy.autoTranslate}</label></div>}
      {dialog==="about"&&<p>{copy.about}</p>}
      {dialog==="search"&&<><WorkspaceSearch label={copy.globalSearch} placeholder={copy.search} value={query} onChange={setQuery}/><div className={styles.spotlightBody}><WorkspaceFunctionResults query={query} locale={locale} isTeacher={user.role==="teacher"} onSelect={id=>{setDialog(null);if(["settings","account","devices","about","create","createLesson","join"].includes(id))setDialog(id as "settings"|"account"|"devices"|"about"|"create"|"createLesson"|"join");else navigate(id as WorkspacePage);}}/><WorkspaceSearchStatus locale={locale} sources={searchSources} retry={{classes:refresh,students:()=>void loadGroups(),chats:()=>void direct.refresh().catch(()=>{})}}/><div className={styles.searchResults}>{!query.trim()?<p>{searchCopy.prompt}</p>:(()=>{const results=searchWorkspace(query,courses,user.role==="teacher"?students:[],direct.chats,{groups:user.role==="teacher"?flattenWorkspaceGroups(groups):[],lessons:workspaceLessons(courses)});return results.length?results.map(result=><button data-search-result key={`${result.kind}:${result.id}`} type="button" onClick={()=>{setDialog(null);if(result.kind==="class"){const course=courses.find(item=>item.id===result.id);if(course)openCourse(course);}else if(result.kind==="lesson"){const target=workspaceLessons(courses).find(item=>item.scheduleId===result.id);if(target)setLesson(target);}else if(result.kind==="group")navigateTarget("groups","groupId",result.id);else if(result.kind==="student")navigateTarget("students","studentId",result.id);else navigateTarget("chat",result.kind==="classChat"?"courseId":"directId",result.id);}}>{result.kind==="class"?<BookOpen size={16}/>:result.kind==="student"||result.kind==="group"?<Users size={16}/>:result.kind==="lesson"?<CalendarDays size={16}/>:<MessageCircle size={16}/>}<span>{result.name}</span><small>{result.kind==="class"?copy.course:result.kind==="student"?copy.student:result.kind==="group"?copy.groups:result.kind==="lesson"?copy.lesson:copy.chat}</small><ChevronRight size={14}/></button>):searchSourcesIncomplete(searchSources)||searchWorkspaceFunctions(query,user.role==="teacher",locale).length||fileSearch.loading||fileSearch.error||fileSearch.files.length?null:<p>{searchCopy.noMatches}</p>;})()}</div><WorkspaceFileSearchResults {...fileSearch} locale={locale} onSelect={file=>{setDialog(null);setSearchFile(file);}}/></div><div className={styles.spotlightFooter}><span>{searchCopy.keys}</span><kbd>esc</kbd></div></>}
    </DialogContent></Dialog>
    <Dialog open={Boolean(searchFile)} onOpenChange={open=>{if(!open)setSearchFile(null);}}><DialogContent className={`${styles.dialog} ${styles.drivePreview}`}><DialogTitle>{searchFile?.name}</DialogTitle><DialogDescription className={styles.srOnly}>{copy.files}</DialogDescription>{searchFile&&<>{workspacePreviewable(searchFile.name)?<WorkspaceFilePreview name={searchFile.name} src={`/api/workspace/drive/${encodeURIComponent(searchFile.id)}/file?preview=1`}/>:<p>{searchCopy.noPreview}</p>}<footer><a className={styles.primary} href={`/api/workspace/drive/${encodeURIComponent(searchFile.id)}/file`} download>{searchCopy.download}</a></footer></>}</DialogContent></Dialog>
    <Dialog open={Boolean(lesson)} onOpenChange={open=>{if(!open&&!entering)setLesson(null);}}><DialogContent className={styles.dialog}><DialogTitle>{lesson?.sessionTitle || lesson?.name || copy.lesson}</DialogTitle><DialogDescription>{lesson?.name}</DialogDescription>{lesson&&<><div className={styles.lessonDetails}><CalendarDays size={16}/><time>{new Intl.DateTimeFormat(locale,{timeZone,dateStyle:"medium",timeStyle:"short"}).format(new Date(lesson.startTime))}</time><small>{timeZone}</small></div><p>{lesson.teacherName}</p>{actionError&&<p className={styles.formError} role="alert">{actionError}</p>}<footer>{["finished","ended"].includes(lesson.status)?<button type="button" className={styles.primary} onClick={()=>router.push(scheduledPlaybackPath(lesson.id,lesson.sessionId))}>{copy.replay}</button>:<button type="button" className={styles.primary} disabled={entering || lesson.status==="cancelled"} onClick={()=>void enter(lesson)}>{entering?copy.loading:copy.enter}</button>}<button type="button" className={styles.button} onClick={()=>router.push(courseWorkspacePath(lesson.id,lesson.sessionId))}>{copy.viewClass}</button></footer></>}</DialogContent></Dialog>
  </WorkspaceShell>;
}
function CreateClass({userId,onBusy,onDiscard,onCreated}:{userId:string;onBusy:(value:boolean)=>void;onDiscard:()=>void;onCreated:(course:WorkspaceCourse)=>void}){
  const copy=useWorkspaceCopy(),{timeZone}=useTimeZone(),{locale}=useTranslation(),creationCopy=workspaceClassCreationCopy(locale);
  const [name,setName]=useState(""),[description,setDescription]=useState(""),[scheduled,setScheduled]=useState(false),[zone,setZone]=useState(timeZone);
  const [starts,setStarts]=useState(()=>zonedInputValue(new Date(Date.now()+300_000),timeZone)),[ends,setEnds]=useState(()=>zonedInputValue(new Date(Date.now()+3_900_000),timeZone));
  const [pending,setPending]=useState(false),[error,setError]=useState(""),[requestId,setRequestId]=useState(()=>crypto.randomUUID()),[uncertain,setUncertain]=useState(false),[restored,setRestored]=useState(false),[confirmDiscard,setConfirmDiscard]=useState(false);
  const storageKey=pendingClassKey(userId),pendingBody=useRef<string|null>(null),persisted=useRef(false);
  const message=creationCopy.pending;
  const adopt=useCallback((saved:PendingClass)=>{pendingBody.current=saved.body;persisted.current=true;setRequestId(saved.requestId);setName(saved.name);setDescription(saved.description);setScheduled(Boolean(saved.startTime));if(saved.timezone&&saved.startTime&&saved.endTime){setZone(saved.timezone);setStarts(zonedInputValue(saved.startTime,saved.timezone));setEnds(zonedInputValue(saved.endTime,saved.timezone));}setUncertain(true);setError(message);},[message]);
  useEffect(()=>{let active=true;queueMicrotask(()=>{if(!active)return;try{const saved=parsePendingClass(localStorage.getItem(storageKey));if(saved)adopt(saved);}catch{/* Storage may be unavailable. */}setRestored(true);});return()=>{active=false;};},[storageKey,adopt]);
  const clear=(body:string)=>{try{const saved=parsePendingClass(localStorage.getItem(storageKey));if(saved?.requestId===requestId&&saved.body===body)localStorage.removeItem(storageKey);}catch{/* Storage may be unavailable. */}};
  async function submit(event:FormEvent){event.preventDefault();if(pending||!restored)return;setError("");let body=pendingBody.current;
    if(!body){try{if(!name.trim())throw new Error(copy.courseRequired);const scheduling:Record<string,string>={};if(scheduled){const start=parseZonedInput(starts,zone),end=parseZonedInput(ends,zone);if(end<=start)throw new Error(copy.invalidTimes);Object.assign(scheduling,{startTime:start.toISOString(),endTime:end.toISOString(),timezone:zone});}body=JSON.stringify({name:name.trim(),description,roomType:4,courseKind:"series",...scheduling});}catch(failure){setError(failure instanceof Error?failure.message:copy.failed);return;}}
    const payload=body;setPending(true);onBusy(true);
    const save=async()=>{try{const existing=parsePendingClass(localStorage.getItem(storageKey));if(existing&&(existing.requestId!==requestId||existing.body!==payload)){adopt(existing);return null;}localStorage.setItem(storageKey,JSON.stringify({requestId,body:payload}));persisted.current=true;}catch{persisted.current=false;}pendingBody.current=payload;try{const result=await retryIdempotentWrite<{course:WorkspaceCourse}>("/api/courses","POST",requestId,payload);clear(payload);return result.course;}catch(failure){if(!uncertain&&!(failure instanceof UncertainWriteError))clear(payload);throw failure;}};
    try{const course=navigator.locks?await navigator.locks.request(storageKey,{ifAvailable:true},lock=>{if(!lock)throw new Error("class-save-in-progress");return save();}):await save();if(course)onCreated(course);}
    catch(failure){if(failure instanceof Error&&failure.message==="class-save-in-progress"){setError(creationCopy.busy);}else if(uncertain||failure instanceof UncertainWriteError){pendingBody.current=payload;setUncertain(true);setError(persisted.current?message:creationCopy.uncertain);}else{pendingBody.current=null;setRequestId(crypto.randomUUID());setError(creationCopy.failed);}}
    finally{setPending(false);onBusy(false);}}
  const discard=async()=>{if(pending)return;setPending(true);onBusy(true);try{const run=()=>{if(pendingBody.current)clear(pendingBody.current);};if(navigator.locks)await navigator.locks.request(storageKey,{ifAvailable:true},lock=>{if(!lock)throw new Error("busy");run();});else run();onDiscard();}catch{setError(creationCopy.busy);}finally{setPending(false);onBusy(false);}};
  const disabled=!restored||pending||uncertain;
  return <form onSubmit={event=>void submit(event)} className={styles.form}><label>{copy.name}<input required maxLength={100} value={name} onChange={event=>setName(event.target.value)} autoFocus disabled={disabled}/></label><label>{copy.description}<textarea maxLength={2000} value={description} onChange={event=>setDescription(event.target.value)} disabled={disabled}/></label><label className={styles.checkLabel}><input type="checkbox" checked={scheduled} onChange={event=>setScheduled(event.target.checked)} disabled={disabled}/>{copy.firstLesson}</label>{scheduled&&<><fieldset disabled={disabled} style={{border:0,padding:0,margin:0,minWidth:0}}><label>{copy.scheduleZone}<SchedulingTimeZone value={zone} onChange={setZone} localValue={starts}/></label></fieldset><div className={styles.timeFields}><label>{copy.starts}<input type="datetime-local" value={starts} required onChange={event=>setStarts(event.target.value)} disabled={disabled}/></label><label>{copy.ends}<input type="datetime-local" value={ends} required onChange={event=>setEnds(event.target.value)} disabled={disabled}/></label></div><ScheduleTimePreview value={starts} timeZone={zone}/></>}{error&&<p role="alert" className={styles.formError}>{error}</p>}{uncertain&&confirmDiscard&&<p role="status">{creationCopy.discardWarning}</p>}<footer>{uncertain&&(confirmDiscard?<><button type="button" disabled={pending} onClick={()=>setConfirmDiscard(false)}>{creationCopy.keepRecovery}</button><button type="button" disabled={pending} onClick={()=>void discard()}>{creationCopy.discardAndClose}</button></>:<button type="button" disabled={pending} onClick={()=>setConfirmDiscard(true)}>{creationCopy.discard}</button>)}<button type="submit" className={styles.primary} disabled={!restored||pending||!name.trim()}>{pending?copy.loading:uncertain?creationCopy.retry:copy.create}</button></footer></form>;
}

export function JoinPublic({onNavigate}:{onNavigate:(path:string)=>void}){
  const copy=useWorkspaceCopy(),{locale}=useTranslation(),[value,setValue]=useState(""),[pending,setPending]=useState(false),[error,setError]=useState("");
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>{active.current?.abort();active.current=null;},[]);
  async function submit(event:FormEvent){event.preventDefault();if(active.current)return;const controller=new AbortController();active.current=controller;setPending(true);setError("");try{
    const entry=value.trim();if(/^https?:\/\//i.test(entry)){const url=new URL(entry);if(url.origin!==window.location.origin || !/^\/(join|course-share)\//.test(url.pathname))throw new Error(copy.publicCode);onNavigate(url.pathname+url.search);return;}
    if(/^\d{6}$/.test(entry)){const result=await workspaceRequest<{success?:unknown;courseId?:unknown}>(`/api/courses/search-by-passcode?passcode=${encodeURIComponent(entry)}`,{signal:controller.signal});if(controller.signal.aborted)return;if(result?.success!==true||typeof result.courseId!=="string"||!result.courseId||result.courseId.length>128)throw new Error(copy.failed);onNavigate(`/courses/${encodeURIComponent(result.courseId)}`);return;}
    if(!/^[0-9a-f]{32}$|^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry))throw new Error(copy.publicCode);
    const compact=entry.replaceAll("-","").toLowerCase();
    const canonical=`${compact.slice(0,8)}-${compact.slice(8,12)}-${compact.slice(12,16)}-${compact.slice(16,20)}-${compact.slice(20)}`;
    onNavigate(`/courses/${canonical}`);
  }catch(failure){if(controller.signal.aborted)return;const ambiguous=typeof failure==="object"&&failure!==null&&"code" in failure&&failure.code==="PASSCODE_AMBIGUOUS";const notFound=failure instanceof Error&&failure.message==="errPasscodeNotFound";setError(ambiguous?(locale==="zh-TW"?"此代碼對應多個公開課，請向老師索取邀請連結。":locale.startsWith("zh")?"此代码对应多个公开课，请向老师索取邀请链接。":locale.startsWith("vi")?"Mã này khớp nhiều lớp công khai. Hãy xin giáo viên liên kết mời.":"This code matches multiple public lessons. Ask for an invitation link."):notFound?(locale==="zh-TW"?"未找到對應的公開課，請檢查代碼或向老師索取邀請連結。":locale.startsWith("zh")?"未找到对应的公开课，请检查代码或向老师索取邀请链接。":locale.startsWith("vi")?"Không tìm thấy lớp công khai. Hãy kiểm tra mã hoặc xin liên kết mời.":"No public lesson found. Check the code or ask for an invitation link."):failure instanceof Error?failure.message:copy.failed);}finally{if(active.current===controller)active.current=null;if(!controller.signal.aborted)setPending(false);}}
  return <form className={styles.form} onSubmit={event=>void submit(event)}><label>{copy.publicCode}<input value={value} onChange={event=>setValue(event.target.value)} required disabled={pending} autoFocus/></label>{error&&<p className={styles.formError} role="alert">{error}</p>}<footer><button type="submit" className={styles.primary} disabled={pending}>{pending?copy.loading:copy.join}</button></footer></form>;
}
