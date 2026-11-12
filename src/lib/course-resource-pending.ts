import {taskRequestId} from "./workspace-task-validation";

export type ResourceScope={userId:string;courseId:string;programId:string|null;unitId:string|null};
export type PendingResource={requestId:string;body:string;sourceId:string;name:string};
export function pendingResourceKey(scope:ResourceScope){return `workspace:resource-pending:${JSON.stringify([scope.userId,scope.courseId,scope.programId,scope.unitId])}`;}
export function parsePendingResource(raw:string|null,scope:ResourceScope):PendingResource|null{
 try{
  if(!raw||raw.length>3000)return null;
  const saved=JSON.parse(raw),requestId=taskRequestId(saved?.requestId);
  if(typeof saved.body!=="string")return null;
  const body=JSON.parse(saved.body);
  if(!body||typeof body.sourceId!=="string"||!body.sourceId||body.sourceId.length>100||typeof body.name!=="string"||!body.name.trim()||body.name.length>80||/[\u0000-\u001f\u007f/\\]/.test(body.name)||body.programId!==scope.programId||body.unitId!==scope.unitId)return null;
  return {requestId,body:saved.body,sourceId:body.sourceId,name:body.name};
 }catch{return null;}
}
