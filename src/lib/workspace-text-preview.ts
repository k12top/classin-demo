export const TEXT_PREVIEW_LIMIT=256*1024;

/** Decode only a bounded prefix, without turning untrusted text into markup. */
export async function readWorkspaceTextPreview(response:Response){
 if(!response.ok||!response.body)throw new Error("Preview unavailable");
 const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,text="";
 while(true){
  const chunk=await reader.read();
  if(chunk.done)return {text:text+decoder.decode(),truncated:false};
  const remaining=TEXT_PREVIEW_LIMIT-bytes;
  if(chunk.value.length>remaining){text+=decoder.decode(chunk.value.subarray(0,remaining),{stream:true});void reader.cancel().catch(()=>{});return {text,truncated:true};}
  bytes+=chunk.value.length;text+=decoder.decode(chunk.value,{stream:true});
 }
}
