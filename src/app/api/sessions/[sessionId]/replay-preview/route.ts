import {NextRequest,NextResponse} from "next/server";
import {activityActor,activityFailure} from "@/lib/classroom/server/activity-route";
import {activityDetail,activityOverview,replayPreviewStudents} from "@/lib/classroom/server/activities";
import {prisma} from "@/lib/db";
import {classroomMessageAccess} from "@/lib/classroom/server/message-access";

/** Teacher-authorized, read-only preview of a specific student's interaction results. */
export async function GET(request:NextRequest,{params}:{params:Promise<{sessionId:string}>}){
 const {sessionId}=await params;
 const actor=await activityActor(request,sessionId,undefined,"activities");
 if(actor instanceof NextResponse)return actor;
 if(actor.role!=="teacher"&&actor.role!=="assistant")return NextResponse.json({error:"Forbidden"},{status:403});
 const studentId=request.nextUrl.searchParams.get("student"),activityId=request.nextUrl.searchParams.get("activity"),view=request.nextUrl.searchParams.get("view"),before=request.nextUrl.searchParams.get("before");
 if((studentId!==null&&(!studentId.trim()||studentId.length>200))||(activityId!==null&&(!activityId.trim()||activityId.length>200))||(!studentId&&activityId)||(view!==null&&view!=="chat")||(view==="chat"&&(!studentId||activityId!==null))||(before!==null&&(view!=="chat"||!before.trim()||before.length>200)))return NextResponse.json({error:"Invalid preview"},{status:400});
 try{
  const lesson=await prisma.courseSession.findFirst({where:{id:sessionId,courseId:actor.courseId},select:{status:true,endedAt:true}});
  if(!lesson||(!lesson.endedAt&&!['finished','afterClass'].includes(lesson.status)))return NextResponse.json({error:"Replay unavailable"},{status:404});
  const roster=await replayPreviewStudents(actor,studentId);
  if(!roster.canManage||roster.live)return NextResponse.json({error:"Forbidden"},{status:403});
  const students=roster.students;
  if(!studentId)return NextResponse.json({students},{headers:{"Cache-Control":"private, no-store"}});
  const student=students.find(item=>item.userId===studentId);
  if(!student)return NextResponse.json({error:"Student unavailable"},{status:404});
  if(view==="chat"){
   // Preview only messages both the teacher and selected student may read.
   const visible={AND:[classroomMessageAccess(sessionId,actor.userId,actor.role),classroomMessageAccess(sessionId,student.userId,"student")]};
   if(before&&!await prisma.classroomMessage.findFirst({where:{AND:[visible,{id:before}]},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
   const rows=await prisma.classroomMessage.findMany({where:visible,orderBy:[{createdAt:"desc"},{id:"desc"}],take:51,...(before?{cursor:{id:before},skip:1}:{})});
   const messages=rows.slice(0,50).reverse().map(message=>({id:message.id,senderName:message.senderName,scope:message.scope,kind:message.kind,content:message.deletedAt?"":message.content,deleted:Boolean(message.deletedAt),createdAt:message.createdAt}));
   return NextResponse.json({messages,nextCursor:rows.length>50?rows[49].id:null},{headers:{"Cache-Control":"private, no-store"}});
  }
  const previewActor={...actor,userId:student.userId,displayName:student.displayName,role:"student" as const};
  const data=activityId?await activityDetail(previewActor,activityId):await activityOverview(previewActor);
  return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return activityFailure(error);}
}
