import {taskRequestId} from "./workspace-task-validation";
export type PendingGroup={requestId:string;body:string;name:string};
export function pendingGroupKey(userId:string){return `workspace:pending-group:${JSON.stringify(userId)}`;}
export function parsePendingGroup(raw:string|null):PendingGroup|null{
 try{
  if(!raw||raw.length>3000)return null;
  const saved=JSON.parse(raw),requestId=taskRequestId(saved?.requestId);
  if(typeof saved.body!=="string")return null;
  const body=JSON.parse(saved.body);
  if(!body||body.action!=="create"||body.parentId!==null||typeof body.name!=="string"||!body.name.trim()||body.name.trim().length>100)return null;
  return {requestId,body:saved.body,name:body.name};
 }catch{return null;}
}
