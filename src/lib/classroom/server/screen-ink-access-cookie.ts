import "server-only";
export const INK_SHARE_COOKIE="classroom_ink_share";
export const INK_RECORDER_COOKIE="classroom_ink_recorder";
export function inkCookiePath(sessionId:string){return `/api/sessions/${encodeURIComponent(sessionId)}/classroom/screen-ink`;}
export function encodeInkRecorder(recordingId:string,token:string){return Buffer.from(JSON.stringify({recordingId,token})).toString("base64url");}
export function decodeInkRecorder(value:string|undefined){
 if(!value||value.length>4096||!/^[A-Za-z0-9_-]+$/.test(value))return null;
 try{const data=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));return typeof data.recordingId==="string"&&typeof data.token==="string"&&data.recordingId.length<=128&&data.token.length<=3000?{recordingId:data.recordingId,recorderToken:data.token}:null;}catch{return null;}
}
