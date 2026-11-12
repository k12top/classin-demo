/** Coalesce refresh triggers while a conversation read is still in flight. */
export function createChatSync(run:()=>Promise<void>, canRun:()=>boolean, onError:()=>void) {
 let busy=false,queued=false,stopped=false;
 const trigger=()=>{
  if(stopped||!canRun())return;
  if(busy){queued=true;return;}
  busy=true;
  void Promise.resolve().then(run).catch(()=>{if(!stopped)onError();}).finally(()=>{
   busy=false;
   if(queued&&!stopped){queued=false;trigger();}
  });
 };
 return {trigger,stop(){stopped=true;queued=false;}};
}
