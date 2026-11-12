import {taskRequestId} from "./workspace-task-validation";
import {isExplicitInstant,validTimeZone} from "./time-zone";
export type PendingClass={requestId:string;body:string;name:string;description:string;startTime:string|null;endTime:string|null;timezone:string|null};
export function pendingClassKey(userId:string){return `workspace:pending-class:${JSON.stringify(userId)}`;}
export function parsePendingClass(raw:string|null):PendingClass|null{
 try{
  if(!raw||raw.length>10_000)return null;
  const saved=JSON.parse(raw),requestId=taskRequestId(saved?.requestId);if(typeof saved.body!=="string")return null;
  const input=JSON.parse(saved.body);
  if(!input||input.courseKind!=="series"||input.roomType!==4||typeof input.name!=="string"||!input.name.trim()||input.name.length>100||typeof input.description!=="string"||input.description.length>2000)return null;
  const scheduled=input.startTime!==undefined||input.endTime!==undefined||input.timezone!==undefined;
  if(scheduled&&(!isExplicitInstant(input.startTime)||!isExplicitInstant(input.endTime)||!validTimeZone(input.timezone)||Date.parse(input.endTime)<=Date.parse(input.startTime)))return null;
  return {requestId,body:saved.body,name:input.name,description:input.description,startTime:scheduled?input.startTime:null,endTime:scheduled?input.endTime:null,timezone:scheduled?input.timezone:null};
 }catch{return null;}
}
