import { NextRequest,NextResponse } from "next/server";
import { activityActor,activityFailure } from "@/lib/classroom/server/activity-route";
import { chatImageForm,saveChatImage } from "@/lib/classroom/server/chat-images";
import { CoursewareStorageConfigurationError } from "@/lib/aliyun-oss";
import { createAssistantLimiter,ClassroomAssistantError } from "@/lib/classroom/server/assistant";
export const runtime='nodejs';
const reserve=createAssistantLimiter();
export async function POST(request:NextRequest,{params}:{params:Promise<{sessionId:string}>}){
 let release:(()=>void)|undefined;
 try{const {sessionId}=await params,actor=await activityActor(request,sessionId,request.nextUrl.searchParams.get('shareAccess')||undefined);if(actor instanceof NextResponse)return actor;
 release=reserve(actor.userId);const form=await chatImageForm(request),file=form.get('image'),id=form.get('uploadId');
 if(!(file instanceof File)||typeof id!=='string')return NextResponse.json({error:'Missing image'},{status:400});
 const saved=await saveChatImage(actor,id,Buffer.from(await file.arrayBuffer()));return NextResponse.json({image:{id:saved.id,width:saved.width,height:saved.height}},{status:201,headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(error instanceof CoursewareStorageConfigurationError)return NextResponse.json({error:'Image upload is temporarily unavailable'},{status:503});if(error instanceof ClassroomAssistantError)return NextResponse.json({error:'Please try again shortly'},{status:error.status});return activityFailure(error)}finally{release?.()}
}
