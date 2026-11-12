import {taskRequestId} from "./workspace-task-validation";
import {assignmentReviewInput,type AssignmentReviewResult} from "./course-assignment-review";
export type PendingReview={requestId:string;submissionVersion:number;expectedVersion:number|null;result:AssignmentReviewResult;feedback:string};
export function reviewPendingKey(userId:string,courseId:string,assignmentId:string,submissionId:string){return `workspace:assignment-review:${JSON.stringify([userId,courseId,assignmentId,submissionId])}`;}
export function parsePendingReview(raw:string|null):PendingReview|null{
 try{if(!raw||raw.length>12000)return null;const value=JSON.parse(raw),requestId=taskRequestId(value?.requestId),input=assignmentReviewInput(value);return {requestId,...input};}catch{return null;}
}
