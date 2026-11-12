import {taskInput,taskRequestId,type TaskInput} from "./workspace-task-validation";

export type PendingTask={requestId:string;body:string;input:TaskInput};
export function pendingTaskKey(userId:string){return `workspace:pending-task:${JSON.stringify(userId)}`;}
/** Local storage can be stale or tampered with; validate before restoring it. */
export function parsePendingTask(raw:string|null):PendingTask|null{
 try{
  if(!raw||raw.length>20_000)return null;
  const saved=JSON.parse(raw);
  if(!saved||typeof saved.body!=="string"||typeof saved.requestId!=="string")return null;
  const requestId=taskRequestId(saved.requestId),input=taskInput(JSON.parse(saved.body));
  return {requestId,body:saved.body,input};
 }catch{return null;}
}
