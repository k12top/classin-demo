export type AssignmentReviewResult="reviewed"|"correct"|"needs_revision";
export function assignmentReviewInput(body:unknown){
 if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Invalid review");
 const value=body as Record<string,unknown>;
 if(typeof value.result!=="string"||!["reviewed","correct","needs_revision"].includes(value.result)||typeof value.feedback!=="string"||value.feedback.length>4000||!Number.isSafeInteger(value.submissionVersion)||Number(value.submissionVersion)<0||!(value.expectedVersion===null||(Number.isSafeInteger(value.expectedVersion)&&Number(value.expectedVersion)>=0)))throw new Error("Invalid review");
 return {result:value.result as AssignmentReviewResult,feedback:value.feedback.trim(),submissionVersion:value.submissionVersion as number,expectedVersion:value.expectedVersion as number|null};
}
