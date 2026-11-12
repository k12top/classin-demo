import { buildCourseSchedule, type ScheduleSession } from "./course-schedule";
import { casdoorUserIdsMatch } from "./casdoor-user";
import { zonedDateKey } from "./time-zone";

/** Show the local date when the next lesson is not on the viewer's current day. */
export function workspaceNextLessonTime(start:string,now:number,locale:string,timeZone:string):string {
 const value=new Date(start),today=zonedDateKey(new Date(now),timeZone),day=zonedDateKey(value,timeZone);
 const differentDay=day!==today,differentYear=day.slice(0,4)!==today.slice(0,4);
 return new Intl.DateTimeFormat(locale,{timeZone,hour:"2-digit",minute:"2-digit",hour12:false,...(differentDay?{month:"short",day:"numeric",...(differentYear?{year:"numeric"}:{})}: {})}).format(value);
}

export type WorkspaceCourse = {
  id: string; name: string; description?: string; teacherName: string;
  teacherId: string; ownerId?: string; ownerName?: string; status: string;
  startTime: string | null; endTime: string | null; roomType: number; courseKind?:"series"|"standalone";
  canTeach?: boolean; lessonTeaching?: boolean; lessonObserving?: boolean; isCourseOwner?: boolean; joinedAs?: "teacher" | "student";
  sessions?: ScheduleSession[]; sessionCount?: number; hasPlayback?: boolean;
  students?: { studentId: string; studentName: string; studentAvatar?: string }[];
  groupLinks?: {groupId?:string;group?:{id:string}}[];
};
export type WorkspaceGroup = {
  id: string; name: string; members: {userId: string; userName?: string; userAvatar?: string;username?:string|null}[];
  children?: WorkspaceGroup[];
};
export type WorkspacePage = "home" | "chat" | "students" | "groups" | "todo" | "calendar" | "files";
export function workspacePage(value: string | null): WorkspacePage {
  if(value === "schedule")return "calendar";
  return ["chat","students","groups","todo","calendar","files"].includes(value || "") ? value as WorkspacePage : "home";
}
/** Keep an explicitly requested student when unfiltered; show a matching result while searching. */
export function workspaceStudentSelection<T extends {id:string}>(students:readonly T[],selectedId:string,query:string):T|undefined {
  if(!selectedId)return students[0];
  return students.find(student=>student.id===selectedId) || students.find(student=>casdoorUserIdsMatch(student.id,selectedId)) || (query.trim()?students[0]:undefined);
}
/** An explicit conversation target must never silently open a different class. */
export function workspaceChatCourse<T extends {id:string}>(courses: readonly T[], selected: string) {
  return selected ? courses.find(course=>course.id===selected) : courses[0];
}
/** An explicit group target must never silently select another group. */
export function workspaceSelectedGroup<T extends {id:string}>(groups:readonly T[],selected:string){
  return selected ? groups.find(group=>group.id===selected) : groups[0];
}
export function teachingCourse(course: WorkspaceCourse, userId: string) {
  if(typeof course.canTeach === "boolean")return course.canTeach;
  if(course.joinedAs)return course.joinedAs === "teacher";
  return course.isCourseOwner === true || casdoorUserIdsMatch(course.ownerId || course.teacherId, userId);
}
/** Participation is display-only; teachingCourse remains the course-wide permission. */
export function participatesInTeaching(course:WorkspaceCourse,userId:string){return teachingCourse(course,userId)||course.lessonTeaching===true;}
/** Only a class manager may schedule; standalone classes already containing a lesson are full. */
export function schedulableWorkspaceCourses(courses:readonly WorkspaceCourse[],userId:string){return courses.filter(course=>teachingCourse(course,userId)&&course.status!=="cancelled"&&(course.courseKind!=="standalone"||!(course.sessionCount??course.sessions?.length??0)));}
export function courseCover(id: string) {
  const hash = [...id].reduce((sum, character) => sum + character.charCodeAt(0),0);
  return `/workspace/${["ocean","canyon","forest"][hash % 3]}.png`;
}
export function courseInitials(name: string) {
  const latin=name.trim().match(/^[A-Za-z][A-Za-z+#]*/)?.[0];
  return latin ? (latin.includes("+") || latin.includes("#") ? latin.slice(0,3) : latin.slice(0,2)).toUpperCase() : [...name].slice(0,2).join("");
}
export function flattenWorkspaceGroups(groups: readonly WorkspaceGroup[]) {
  const result: WorkspaceGroup[] = [], seen = new Set<string>();
  function visit(group: WorkspaceGroup, prefix="") {
    if(seen.has(group.id))return;seen.add(group.id);
    const name=prefix ? `${prefix} / ${group.name}` : group.name;
    result.push({...group,name});for(const child of group.children || [])visit(child,name);
  }
  groups.forEach(group=>visit(group));return result;
}
export function workspaceStudents(courses: readonly WorkspaceCourse[], groups: readonly WorkspaceGroup[], userId: string) {
  const students = new Map<string,{id:string;name:string;avatar?:string;courses:string[];groups:string[]}>();
  function person(id:string,name:string,avatar?:string) {
    const key=id.split("/").at(-1) || id;
    if(!students.has(key))students.set(key,{id,name:name || id,avatar,courses:[],groups:[]});
    return students.get(key)!;
  }
  for(const course of courses.filter(course=>teachingCourse(course,userId)))for(const member of course.students || []){
    const student=person(member.studentId,member.studentName,member.studentAvatar);
    if(!student.courses.includes(course.id))student.courses.push(course.id);
  }
  for(const group of flattenWorkspaceGroups(groups))for(const member of group.members || []){
    const student=person(member.userId,member.userName || member.userId,member.userAvatar);
    if(!student.groups.includes(group.id))student.groups.push(group.id);
    for(const course of courses.filter(course=>teachingCourse(course,userId)))if(course.groupLinks?.some(link=>(link.groupId||link.group?.id)===group.id)&&!student.courses.includes(course.id))student.courses.push(course.id);
  }
  return [...students.values()];
}
/** Filter the visible directory using all authorized group paths, including nested groups. */
export function filterWorkspaceStudents<T extends {id:string;name:string;groups:string[]}>(students:readonly T[],groups:readonly WorkspaceGroup[],query:string):T[]{
  const needle=query.trim().toLocaleLowerCase();
  if(!needle)return [...students];
  const names=new Map(flattenWorkspaceGroups(groups).map(group=>[group.id,group.name]));
  return students.filter(student=>[student.name,student.id,...student.groups.map(id=>names.get(id)||"")].some(value=>value.toLocaleLowerCase().includes(needle)));
}
export function workspaceLessons(courses: readonly WorkspaceCourse[]) { return buildCourseSchedule(courses); }
export type WorkspaceLesson = ReturnType<typeof workspaceLessons>[number];
/** Keep an open detail tied to the same lesson in the latest authorized list. */
export function refreshedWorkspaceLesson(current:WorkspaceLesson|null,courses:readonly WorkspaceCourse[]):WorkspaceLesson|null {
  return current ? workspaceLessons(courses).find(lesson=>lesson.scheduleId===current.scheduleId)||null : null;
}
export function upcomingLessons(courses: readonly WorkspaceCourse[], now: number) {
  // A live or after-class session can remain enterable beyond its scheduled end.
  // The server remains authoritative when the user actually enters the room.
  return workspaceLessons(courses).filter(lesson=>!["finished","cancelled","ended"].includes(lesson.status) && (["live","afterClass"].includes(lesson.status)||Date.parse(lesson.endTime || lesson.startTime)>=now));
}
/** Only actual, still-unstarted lessons; an overdue scheduled lesson remains visible. */
export function unstartedLessons(courses: readonly WorkspaceCourse[]) {
  return workspaceLessons(courses).filter(lesson=>Boolean(lesson.sessionId)&&lesson.status==="scheduled");
}
export function recentLessons(courses: readonly WorkspaceCourse[]) {
  return workspaceLessons(courses).filter(lesson=>(lesson.status === "finished" || lesson.status === "ended") && lesson.hasPlayback).reverse();
}
