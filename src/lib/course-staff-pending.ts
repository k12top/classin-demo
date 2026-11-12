import {taskRequestId} from "./workspace-task-validation";

export type PendingStaffAssignment = {requestId:string;body:string};
export const STAFF_ASSIGNMENT_LIMIT=100;
/** Preserve selected lessons and let users remove selections when at the limit. */
export function toggleStaffLesson(selected:string[],id:string,checked:boolean,single:boolean):string[]{
 if(single)return checked?[id]:[];
 if(!checked)return selected.filter(value=>value!==id);
 if(selected.includes(id)||selected.length>=STAFF_ASSIGNMENT_LIMIT)return selected;
 return [...selected,id];
}
export function staffPendingKey(userId:string,courseId:string){
 return `workspace:staff-pending:${JSON.stringify([userId,courseId])}`;
}
export class StaffAssignmentBusyError extends Error {}
/** Keep the recovery record and its request together across same-origin windows. */
export async function withStaffAssignmentLock<T>(locks:LockManager|undefined,key:string,operation:()=>Promise<T>):Promise<T>{
 if(!locks)return operation();
 return locks.request(key,{ifAvailable:true},lock=>{
  if(!lock)throw new StaffAssignmentBusyError();
  return operation();
 });
}
/** Validate local data before retrying the original idempotent assignment. */
export function parsePendingStaffAssignment(raw:string|null):PendingStaffAssignment|null{
 try{
  if(!raw||raw.length>32_000)return null;
  const saved=JSON.parse(raw),requestId=taskRequestId(saved?.requestId);
  if(typeof saved.body!=="string")return null;
  const body=JSON.parse(saved.body);
  if(!body||typeof body.staffId!=="string"||!body.staffId.trim()||body.staffId.length>200||!["teacher","assistant","observer","remove"].includes(body.role)||!Array.isArray(body.targets)||!body.targets.length||body.targets.length>STAFF_ASSIGNMENT_LIMIT)return null;
  const ids=new Set<string>();
  for(const target of body.targets){
   if(!target||typeof target.id!=="string"||!target.id||target.id.length>100||ids.has(target.id)||typeof target.updatedAt!=="string"||!Number.isFinite(Date.parse(target.updatedAt))||new Date(target.updatedAt).toISOString()!==target.updatedAt)return null;
   ids.add(target.id);
  }
  return {requestId,body:saved.body};
 }catch{return null;}
}
