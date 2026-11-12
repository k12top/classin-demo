import {workspaceRequest} from "./workspace-client";
import {retryIdempotentWrite} from "./workspace-idempotent-write";
export {UncertainWriteError as AssignmentSaveUncertainError} from "./workspace-idempotent-write";
export function createAssignmentDraft<T>(path:string,requestId:string,body:string,request:typeof workspaceRequest=workspaceRequest):Promise<T>{return retryIdempotentWrite(path,"POST",requestId,body,request,{"X-Assignment-Recovery":"1"});}
export function updateAssignmentDraft<T>(path:string,requestId:string,body:string,request:typeof workspaceRequest=workspaceRequest):Promise<T>{return retryIdempotentWrite(path,"PATCH",requestId,body,request);}
