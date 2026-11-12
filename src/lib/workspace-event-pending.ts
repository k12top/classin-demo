import {eventInput} from "./workspace-event-validation";
import {taskRequestId} from "./workspace-task-validation";

export type PendingEvent={requestId:string;body:string;input:ReturnType<typeof eventInput>};
export function pendingEventKey(userId:string){return `workspace:pending-event:${JSON.stringify(userId)}`;}
export function parsePendingEvent(raw:string|null):PendingEvent|null{
 try{
  if(!raw||raw.length>20_000)return null;
  const saved=JSON.parse(raw);
  if(!saved||typeof saved.body!=="string"||typeof saved.requestId!=="string")return null;
  return {requestId:taskRequestId(saved.requestId),body:saved.body,input:eventInput(JSON.parse(saved.body))};
 }catch{return null;}
}
