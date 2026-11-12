import {taskRequestId} from "./workspace-task-validation";

export type PendingFolder={requestId:string;body:string;name:string};
export function pendingFolderKey(userId:string,parentId:string|null){return `workspace:pending-folder:${JSON.stringify([userId,parentId])}`;}
export function parsePendingFolder(raw:string|null,parentId:string|null):PendingFolder|null{
 try{
  if(!raw||raw.length>3000)return null;
  const saved=JSON.parse(raw),requestId=taskRequestId(saved?.requestId);
  if(typeof saved.body!=="string")return null;
  const input=JSON.parse(saved.body);
  if(!input||typeof input.name!=="string"||!input.name.trim()||input.name.trim().length>200||/[\u0000-\u001f\u007f/\\]/.test(input.name)||input.parentId!==parentId)return null;
  return {requestId,body:saved.body,name:input.name};
 }catch{return null;}
}
