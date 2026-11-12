import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activityActor, activityFailure } from "@/lib/classroom/server/activity-route";
import { isChatImageId } from "@/lib/classroom/chat-image-message";
import { readScreenInkAsset } from "@/lib/classroom/server/screen-ink-assets";
import { resolveRecorderAccess } from "@/lib/classroom/server/recorder-access";
import { decodeInkRecorder, INK_RECORDER_COOKIE, INK_SHARE_COOKIE } from "@/lib/classroom/server/screen-ink-access-cookie";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{sessionId:string;assetId:string}>}) {
 try {
  const {sessionId,assetId}=await params;if(!isChatImageId(assetId))return NextResponse.json({error:"Image not found"},{status:404});
  // A recorder credential must not override an ordinary signed-in user's
  // own lesson permissions on a shared browser profile.
  const storedRecorder=request.cookies.has("classroom_session")?null:decodeInkRecorder(request.cookies.get(INK_RECORDER_COOKIE)?.value);
  const recorderToken=request.nextUrl.searchParams.get("recorderToken")||storedRecorder?.recorderToken,recordingId=request.nextUrl.searchParams.get("recordingId")||storedRecorder?.recordingId;
  if(recorderToken&&recordingId){
   if(!await resolveRecorderAccess({sessionId,recordingId,recorderToken}))return NextResponse.json({error:"Image not found"},{status:404});
  }else{
   const actor=await activityActor(request,sessionId,request.nextUrl.searchParams.get("shareAccess")||request.cookies.get(INK_SHARE_COOKIE)?.value||undefined,"activities");if(actor instanceof NextResponse)return actor;
  }
  const asset=await prisma.classroomScreenInkAsset.findFirst({where:{id:assetId,sessionId},select:{objectKey:true}});
  if(!asset)return NextResponse.json({error:"Image not found"},{status:404});
  const bytes=await readScreenInkAsset(asset.objectKey);
  return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Content-Length":String(bytes.length),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
 } catch(error) {return activityFailure(error);}
}
