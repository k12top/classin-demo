export type AssignmentScope={userId:string;courseId:string;programId:string|null;unitId:string|null;draftId:string|null};
export type PendingAssignment={requestId:string;body:string};
export class AssignmentPendingBusyError extends Error {}
/** Serialize recovery record changes across windows of the same origin. */
export async function withAssignmentPendingLock<T>(locks:LockManager|undefined,key:string,operation:()=>Promise<T>):Promise<T>{
 if(!locks)return operation();
 return locks.request(key,{ifAvailable:true},lock=>{if(!lock)throw new AssignmentPendingBusyError();return operation();});
}

export function assignmentPendingKey(scope:AssignmentScope){
 return `workspace:assignment-pending:${JSON.stringify([scope.userId,scope.courseId,scope.programId,scope.unitId,scope.draftId])}`;
}

/** Treat local data as untrusted and only restore requests for this exact form. */
export function parsePendingAssignment(raw:string|null,scope:AssignmentScope):PendingAssignment|null{
 try{
  if(!raw||raw.length>12_000)return null;
  const saved=JSON.parse(raw);
  if(!saved||typeof saved.requestId!=="string"||!/^[a-zA-Z0-9_-]{8,100}$/.test(saved.requestId)||typeof saved.body!=="string")return null;
  const body=JSON.parse(saved.body);
  if(!body||typeof body.title!=="string"||!body.title.trim()||body.title.length>80||typeof body.description!=="string"||body.description.length>2000||!(body.dueDate===null||(typeof body.dueDate==="string"&&body.dueDate.length<=32)))return null;
  if(scope.draftId){if(!Number.isSafeInteger(body.version)||body.version<0)return null;}
  else if(body.programId!==scope.programId||body.unitId!==scope.unitId)return null;
  return {requestId:saved.requestId,body:saved.body};
 }catch{return null;}
}
