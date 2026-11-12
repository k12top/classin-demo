import { NextRequest, NextResponse } from "next/server";
import { activityActor, activityFailure } from "@/lib/classroom/server/activity-route";
import { resolveRecorderAccess } from "@/lib/classroom/server/recorder-access";
import { classroomCookiePolicy } from "@/lib/classroom/embed-policy";
import { encodeInkRecorder, inkCookiePath, INK_RECORDER_COOKIE, INK_SHARE_COOKIE } from "@/lib/classroom/server/screen-ink-access-cookie";

export const runtime="nodejs";
export async function POST(request:NextRequest,{params}:{params:Promise<{sessionId:string}>}){
 try{
  if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Invalid origin"},{status:403});
  const length=request.headers.get("content-length");if(length&&(!/^\d+$/.test(length)||Number(length)>8192))return NextResponse.json({error:"Invalid request"},{status:413});
  if(!request.body)return NextResponse.json({error:"Invalid request"},{status:400});
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return NextResponse.json({error:"Invalid request"},{status:413});}chunks.push(value);}}finally{reader.releaseLock();}
  let body:Record<string,unknown>;try{const value:unknown=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!value||typeof value!=="object"||Array.isArray(value))throw Error();body=value as Record<string,unknown>;}catch{return NextResponse.json({error:"Invalid request"},{status:400});}
  const {sessionId}=await params,path=inkCookiePath(sessionId),options={...classroomCookiePolicy(),httpOnly:true,path,maxAge:21600};
  const response=new NextResponse(null,{status:204,headers:{"Cache-Control":"no-store"}});
  if(typeof body.shareAccess==="string"&&body.shareAccess.length>0&&body.shareAccess.length<=3000){
   const actor=await activityActor(request,sessionId,body.shareAccess,"activities");if(actor instanceof NextResponse)return actor;
   response.cookies.set(INK_RECORDER_COOKIE,"",{...options,maxAge:0});response.cookies.set(INK_SHARE_COOKIE,body.shareAccess,options);return response;
  }
  if(typeof body.recordingId==="string"&&body.recordingId.length<=128&&typeof body.recorderToken==="string"&&body.recorderToken.length>0&&body.recorderToken.length<=3000){
   if(!await resolveRecorderAccess({sessionId,recordingId:body.recordingId,recorderToken:body.recorderToken}))return NextResponse.json({error:"Forbidden"},{status:403});
   response.cookies.set(INK_SHARE_COOKIE,"",{...options,maxAge:0});response.cookies.set(INK_RECORDER_COOKIE,encodeInkRecorder(body.recordingId,body.recorderToken),options);return response;
  }
  return NextResponse.json({error:"Invalid request"},{status:400});
 }catch(error){return activityFailure(error);}
}
