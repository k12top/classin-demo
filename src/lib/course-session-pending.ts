import {taskRequestId} from "./workspace-task-validation";
import {MAX_COURSE_SESSION_OCCURRENCES} from "./course-session-schedule";

export type PendingLessonCreation={requestId:string;body:string;expectedCount:number;title:string};
/** The recovery record belongs to one signed-in account and one class in this tab. */
export function pendingLessonKey(userId:string,courseId:string){return `workspace:lesson-pending:${JSON.stringify([userId,courseId])}`;}
export function parsePendingLesson(raw:string|null):PendingLessonCreation|null{
 try{
  if(!raw||raw.length>200_000)return null;
  const record=JSON.parse(raw),requestId=taskRequestId(record?.requestId);
  if(typeof record.body!=="string")return null;
  const body=JSON.parse(record.body),schedule=body?.schedule;
  if(!body||typeof body!=="object"||Array.isArray(body)||!schedule||typeof schedule!=="object")return null;
  if(body.title!==undefined&&(typeof body.title!=="string"||body.title.length>200))return null;
  const expectedCount=schedule.type==="single"?1:schedule.type==="recurring"?schedule.count:0;
  if(!Number.isInteger(expectedCount)||expectedCount<1||expectedCount>MAX_COURSE_SESSION_OCCURRENCES)return null;
  if(schedule.type==="single"&&(!Number.isFinite(Date.parse(schedule.startTime))||!Number.isFinite(Date.parse(schedule.endTime))||Date.parse(schedule.endTime)<=Date.parse(schedule.startTime)))return null;
  if(schedule.type==="recurring"&&(typeof schedule.firstDate!=="string"||typeof schedule.localStartTime!=="string"||!Array.isArray(schedule.weekdays)))return null;
  return {requestId,body:record.body,expectedCount,title:body.title||""};
 }catch{return null;}
}
export function validLessonCreationReceipt(value:unknown,expectedCount:number):boolean{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const sessions=(value as {sessions?:unknown}).sessions;
 if(!Array.isArray(sessions)||sessions.length!==expectedCount)return false;
 const ids=sessions.map(item=>item&&typeof item==="object"&&!Array.isArray(item)?(item as {id?:unknown}).id:null);
 return ids.every(id=>typeof id==="string"&&id.length>0)&&new Set(ids).size===ids.length;
}
