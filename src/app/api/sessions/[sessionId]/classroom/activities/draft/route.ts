import { NextRequest, NextResponse } from "next/server";
import { activityActor, activityFailure } from "@/lib/classroom/server/activity-route";
import { assistantBody, createAssistantLimiter, ClassroomAssistantError } from "@/lib/classroom/server/assistant";
import { generateActivityDraft } from "@/lib/classroom/server/activity-draft";
import { canManageClassroom } from "@/lib/classroom/server/management";
import { prisma } from "@/lib/db";
import type { ActivityKind, QuestionKind } from "@/lib/classroom/activities";
export const runtime="nodejs";
export const maxDuration=60;
const reserve=createAssistantLimiter();
export async function POST(request:NextRequest,{params}:{params:Promise<{sessionId:string}>}){
 let release:(()=>void)|undefined;
 try{
  const body=await assistantBody(request),{sessionId}=await params;
  const actor=await activityActor(request,sessionId,typeof body.shareAccess==='string'?body.shareAccess:undefined);if(actor instanceof NextResponse)return actor;
  if(!await canManageClassroom(actor.sessionId,actor.userId,actor.role))return NextResponse.json({error:'Only authorized teachers can prepare questions'},{status:403});
  const lesson=await prisma.courseSession.findUnique({where:{id:actor.sessionId},select:{endedAt:true,status:true}});if(!lesson||lesson.endedAt||['finished','cancelled'].includes(lesson.status))return NextResponse.json({error:'Lesson has ended'},{status:409});
  release=reserve(actor.userId);
  const draft=await generateActivityDraft({seed:typeof body.seed==='string'?body.seed:'',kind:body.kind as ActivityKind,type:body.type as QuestionKind,mode:body.mode as 'generate'|'polish',language:typeof body.language==='string'?body.language.slice(0,80):'zh-CN'},request.signal);
  return NextResponse.json({draft},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){if(error instanceof ClassroomAssistantError)return NextResponse.json({error:'AI is temporarily unavailable; your draft is retained',code:error.code},{status:error.status});return activityFailure(error)}finally{release?.()}
}
