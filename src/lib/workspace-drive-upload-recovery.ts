import {taskRequestId} from "./workspace-task-validation";

export type PendingDriveUpload={requestId:string;uploadedId:string;name:string;parentId:string|null};
export function driveUploadPrefix(userId:string){return `workspace:drive-upload:${JSON.stringify(userId)}:`;}
export function driveUploadKey(userId:string,requestId:string){return driveUploadPrefix(userId)+taskRequestId(requestId);}
export function parsePendingDriveUpload(raw:string|null):PendingDriveUpload|null{
 try{
  if(!raw||raw.length>2000)return null;
  const value=JSON.parse(raw);if(!value||typeof value.requestId!=="string")return null;
  const requestId=taskRequestId(value.requestId);
  if(typeof value.uploadedId!=="string"||!value.uploadedId||value.uploadedId.length>100||
    typeof value.name!=="string"||!value.name.trim()||value.name.length>255||
    (value.parentId!==null&&(typeof value.parentId!=="string"||!value.parentId||value.parentId.length>100)))return null;
  return {requestId,uploadedId:value.uploadedId,name:value.name,parentId:value.parentId};
 }catch{return null;}
}
export function listPendingDriveUploads(storage:Storage,userId:string):PendingDriveUpload[]{
 const prefix=driveUploadPrefix(userId),result:PendingDriveUpload[]=[];
 for(let index=0;index<storage.length;index++){
  const key=storage.key(index);if(!key?.startsWith(prefix))continue;
  const item=parsePendingDriveUpload(storage.getItem(key));
  if(item&&key===driveUploadKey(userId,item.requestId))result.push(item);
 }
 return result;
}
