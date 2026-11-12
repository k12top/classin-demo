/** Access failures take precedence over temporary failures across course reads. */
export function workspaceAccessDenied(failure:unknown):boolean {
 const status=(failure as {status?:number}|null)?.status;
 return status===401||status===403||status===404;
}

export async function settleWorkspaceLoads(loads:Promise<unknown>[]):Promise<void> {
 const results=await Promise.allSettled(loads);
 const failures=results.filter((result):result is PromiseRejectedResult=>result.status==="rejected");
 if(failures.length)throw (failures.find(result=>workspaceAccessDenied(result.reason))||failures[0]).reason;
}

/** Continue checking queued courses after a failure, without publishing partial data. */
export async function loadWorkspaceCourses<T>(ids:readonly string[],signal:AbortSignal,load:(id:string,signal:AbortSignal)=>Promise<T>):Promise<T[]> {
 const results=new Array<T>(ids.length),failures:unknown[]=[];
 const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal]);
 let next=0,denied:unknown;
 async function worker(){
  while(next<ids.length){
   if(combined.aborted)throw denied??combined.reason;
   const index=next++;
   try{results[index]=await load(ids[index],combined);}catch(failure){
    if(signal.aborted)throw failure;
    if(workspaceAccessDenied(failure)){denied=failure;controller.abort();throw failure;}
    if(combined.aborted)throw denied??failure;
    failures.push(failure);
   }
  }
 }
 try{
  await Promise.all(Array.from({length:Math.min(3,ids.length)},()=>worker()));
  if(failures.length)throw failures[0];
  return results;
 }finally{controller.abort();}
}
