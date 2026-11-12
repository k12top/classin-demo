import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/db";
import {getSessionFromRequest} from "@/lib/session";
import {casdoorUserIdCandidates} from "@/lib/course-teacher";
import {getEffectiveSessionRoster,rosterContainsUser} from "@/lib/course-session-roster";
import {isExplicitInstant,validTimeZone} from "@/lib/time-zone";
type Context={params:Promise<{id:string;sessionId:string}>};
export async function PATCH(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(user.role!=="teacher")return NextResponse.json({error:"Forbidden"},{status:403});
 const {id:courseId,sessionId}=await params;let title:string,timezone:string,start:Date,end:Date,version:Date;
 try{const body=await request.json();if(typeof body.title!=="string"||!body.title.trim()||body.title.trim().length>200||!validTimeZone(body.timezone)||!isExplicitInstant(body.startTime)||!isExplicitInstant(body.endTime)||!isExplicitInstant(body.updatedAt))throw new Error();title=body.title.trim();timezone=body.timezone;start=new Date(body.startTime);end=new Date(body.endTime);version=new Date(body.updatedAt);const minutes=(end.getTime()-start.getTime())/60000;if(!Number.isInteger(minutes)||minutes<10||minutes>720)throw new Error();}catch{return NextResponse.json({error:"Invalid lesson details"},{status:400});}
 try{
  const result=await prisma.$transaction(async tx=>{
   const roster=await getEffectiveSessionRoster(sessionId,tx);if(!roster||roster.courseId!==courseId)return "notFound";
   const aliases=[...casdoorUserIdCandidates(user.userId),...casdoorUserIdCandidates(user.name||"")];const member=rosterContainsUser(roster,aliases);
   if(member?.kind!=="teacher"||member.member.role!=="teacher")return "forbidden";
   const lesson=await tx.courseSession.findFirst({where:{id:sessionId,courseId},select:{seriesId:true}});if(!lesson)return "notFound";
   const changed=await tx.courseSession.updateMany({where:{id:sessionId,courseId,status:"scheduled",endedAt:null,updatedAt:version},data:{title,startTime:start,endTime:end,timezone,...(lesson.seriesId?{isDetached:true}:{})}});
   return changed.count?"saved":"conflict";
  },{isolationLevel:"Serializable"});
  if(result==="forbidden")return NextResponse.json({error:"Forbidden"},{status:403});
  if(result==="notFound")return NextResponse.json({error:"Lesson unavailable"},{status:404});
  if(result==="conflict")return NextResponse.json({error:"Lesson changed; refresh and retry"},{status:409});
  return NextResponse.json({updated:true});
 }catch{return NextResponse.json({error:"Unable to update lesson; refresh and retry"},{status:503});}
}
