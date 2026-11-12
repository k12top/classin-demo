import {taskRequestId} from "./workspace-task-validation";
export type PendingPublication={requestId:string;version:number};
export function publicationPendingKey(userId:string,courseId:string,draftId:string){return `workspace:assignment-publication:${JSON.stringify([userId,courseId,draftId])}`;}
export function parsePendingPublication(raw:string|null):PendingPublication|null{
 try{if(!raw||raw.length>1000)return null;const value=JSON.parse(raw),requestId=taskRequestId(value?.requestId);if(!Number.isSafeInteger(value?.version)||value.version<0)return null;return {requestId,version:value.version};}catch{return null;}
}
