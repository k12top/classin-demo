/** Bound concurrent background reads; an aborted queued request never starts. */
export function createWorkspaceReadQueue(limit:number) {
 let active=0;
 const pending:Array<()=>void>=[];
 const next=()=>{while(active<limit && pending.length)pending.shift()?.();};
 return function enqueue<T>(signal:AbortSignal,read:()=>Promise<T>):Promise<T> {
  return new Promise((resolve,reject)=>{
   const cancel=()=>{const index=pending.indexOf(start);if(index>=0){pending.splice(index,1);reject(new DOMException("Aborted","AbortError"));}};
   const start=()=>{
    signal.removeEventListener("abort",cancel);
    if(signal.aborted){reject(new DOMException("Aborted","AbortError"));return;}
    active++;
    Promise.resolve().then(read).then(resolve,reject).finally(()=>{active--;next();});
   };
   if(signal.aborted){reject(new DOMException("Aborted","AbortError"));return;}
   pending.push(start);signal.addEventListener("abort",cancel,{once:true});next();
  });
 };
}
