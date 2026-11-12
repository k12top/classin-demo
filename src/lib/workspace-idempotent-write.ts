import {workspaceRequest} from "./workspace-client";

export class UncertainWriteError extends Error {
 constructor(){super("Save outcome is unknown");this.name="UncertainWriteError";}
}

/** Only use this for endpoints that persist and verify the request ID and body. */
export async function retryIdempotentWrite<T>(path:string,method:"POST"|"PATCH",requestId:string,body:string,request:typeof workspaceRequest=workspaceRequest,extraHeaders:Record<string,string>={}):Promise<T>{
 const options:RequestInit={method,headers:{...extraHeaders,"Content-Type":"application/json","Idempotency-Key":requestId},body};
 try{return await request<T>(path,options);}catch(error){
  const status=typeof error==="object"&&error!==null&&"status" in error?Number(error.status):0;
  if(status>=400&&status<500&&status!==408&&status!==429)throw error;
 }
 try{return await request<T>(path,options);}catch{throw new UncertainWriteError();}
}
