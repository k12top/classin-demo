import {workspaceRequest} from "./workspace-client";
import type {WorkspaceGroup} from "./workspace-model";

/** Only the latest read may publish data or an error; superseded callers follow it. */
export function createWorkspaceGroupLoader(
 onSuccess:(groups:WorkspaceGroup[])=>void,
 onFailure:(denied:boolean)=>void,
 request:typeof workspaceRequest=workspaceRequest,
){
 let generation=0,latest:Promise<boolean>|null=null;
 return {
  load():Promise<boolean>{
   const current=++generation;
   const run=(async()=>{
    try{
     const result=await request<{groups:WorkspaceGroup[]}>("/api/groups");
     if(current!==generation)return latest??false;
     onSuccess(result.groups||[]);return true;
    }catch(error){
     if(current!==generation)return latest??false;
     const status=typeof error==="object"&&error!==null&&"status" in error?Number(error.status):0;
     onFailure(status===401||status===403||status===404);return false;
    }
   })();
   latest=run;return run;
  },
  invalidate(){generation++;latest=null;},
 };
}
