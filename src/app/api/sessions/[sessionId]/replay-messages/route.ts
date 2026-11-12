import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {resolveCoursewareAccess} from "@/lib/courseware-access";
import {classroomMessageAccess} from "@/lib/classroom/server/message-access";
import {prisma} from "@/lib/db";

/** Replay uses the same room, staff and direct-message visibility as live chat. */
export async function GET(request:NextRequest,{params}:{params:Promise<{sessionId:string}>}){
 const identity=await getSessionFromRequest(request);if(!identity)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {sessionId}=await params;
 try{
  const lesson=await prisma.courseSession.findUnique({where:{id:sessionId},select:{courseId:true}});if(!lesson)return NextResponse.json({error:"Session not found"},{status:404});
  const access=await resolveCoursewareAccess(identity,lesson.courseId,sessionId);if(!access.allowed)return NextResponse.json({error:"Forbidden"},{status:403});
  const visible=classroomMessageAccess(sessionId,identity.userId,access.observer?"observer":access.teaching?"teacher":"student"),cursor=request.nextUrl.searchParams.get("before");
  if(cursor&&!await prisma.classroomMessage.findFirst({where:{AND:[visible,{id:cursor}]},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.classroomMessage.findMany({where:visible,orderBy:[{createdAt:"desc"},{id:"desc"}],take:51,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const messages=rows.slice(0,50).reverse().map(message=>({id:message.id,senderName:message.senderName,scope:message.scope,kind:message.kind,content:message.deletedAt?"":message.content,deleted:Boolean(message.deletedAt),createdAt:message.createdAt}));
  return NextResponse.json({messages,nextCursor:rows.length>50?rows[49].id:null},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to load classroom chat"},{status:503});}
}
