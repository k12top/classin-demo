type InkViewerContext={sessionId:string;shareAccess?:string;recordingId?:string;recorderToken?:string};

/** Exchange a viewer's existing credential for an asset-scoped HttpOnly cookie. */
export async function prepareScreenInkAccess(input:InkViewerContext,signal:AbortSignal,request:typeof fetch=fetch) {
 const body=input.recorderToken&&input.recordingId?{recordingId:input.recordingId,recorderToken:input.recorderToken}:input.shareAccess?{shareAccess:input.shareAccess}:null;
 if(!body)return;
 const response=await request(`/api/sessions/${encodeURIComponent(input.sessionId)}/classroom/screen-ink/context`,{
  method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal,
 });
 if(!response.ok)throw new Error("SCREEN_INK_CONTEXT_UNAVAILABLE");
}
