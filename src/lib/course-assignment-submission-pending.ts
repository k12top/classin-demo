import {taskRequestId} from "./workspace-task-validation";
export type PendingSubmission={requestId:string;content:string;expectedVersion:number|null};
export function submissionPendingKey(userId:string,courseId:string,assignmentId:string){return `workspace:assignment-submission:${JSON.stringify([userId,courseId,assignmentId])}`;}
export function parsePendingSubmission(raw:string|null):PendingSubmission|null{
 try{if(!raw||raw.length>30000)return null;const value=JSON.parse(raw),requestId=taskRequestId(value?.requestId);if(typeof value.content!=="string"||!value.content.trim()||value.content.length>10000||!(value.expectedVersion===null||(Number.isSafeInteger(value.expectedVersion)&&value.expectedVersion>=0)))return null;return {requestId,content:value.content,expectedVersion:value.expectedVersion};}catch{return null;}
}
