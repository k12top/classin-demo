import { NextRequest, NextResponse } from "next/server";
import { activityActor, activityFailure } from "@/lib/classroom/server/activity-route";
import { saveScreenInkAsset, screenInkForm } from "@/lib/classroom/server/screen-ink-assets";
import { CoursewareStorageConfigurationError } from "@/lib/aliyun-oss";
import { ClassroomAssistantError, createAssistantLimiter } from "@/lib/classroom/server/assistant";
import { INK_SHARE_COOKIE } from "@/lib/classroom/server/screen-ink-access-cookie";

export const runtime="nodejs";
const reserve=createAssistantLimiter();
export async function POST(request:NextRequest,{params}:{params:Promise<{sessionId:string}>}) {
 let release:(()=>void)|undefined;
 try {
  const {sessionId}=await params,actor=await activityActor(request,sessionId,request.nextUrl.searchParams.get("shareAccess")||request.cookies.get(INK_SHARE_COOKIE)?.value||undefined);
  if(actor instanceof NextResponse)return actor;
  release=reserve(actor.userId);const form=await screenInkForm(request),image=form.get("image"),id=form.get("uploadId"),clientId=form.get("clientId"),claimId=form.get("claimId");
  if(!(image instanceof File)||typeof id!=="string"||typeof clientId!=="string"||typeof claimId!=="string")return NextResponse.json({error:"Invalid ink upload"},{status:400});
  const saved=await saveScreenInkAsset(actor,{id,clientId,claimId,data:Buffer.from(await image.arrayBuffer())});
  return NextResponse.json({image:{id:saved.id,width:saved.width,height:saved.height}},{status:201,headers:{"Cache-Control":"private, no-store"}});
 } catch(error) {
  if(error instanceof CoursewareStorageConfigurationError)return NextResponse.json({error:"Ink upload is temporarily unavailable"},{status:503});
  if(error instanceof ClassroomAssistantError)return NextResponse.json({error:"Please try again shortly"},{status:error.status});
  return activityFailure(error);
 } finally {release?.();}
}
