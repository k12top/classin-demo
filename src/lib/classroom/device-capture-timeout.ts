/** Device permission prompts can remain open forever; dispose a late grant. */
export function withDeviceCaptureTimeout<T>(capture:Promise<T>,dispose:(value:T)=>void,timeoutMs=20_000):Promise<T>{
 return new Promise((resolve,reject)=>{
  let settled=false;
  const timer=setTimeout(()=>{settled=true;reject(new Error("DEVICE_CAPTURE_TIMEOUT"));},timeoutMs);
  capture.then(value=>{
   if(settled){try{dispose(value);}catch{/* Late capture must not stay open. */}return;}
   settled=true;clearTimeout(timer);resolve(value);
  },error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
 });
}
