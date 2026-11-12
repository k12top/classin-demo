import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {canAccessCourseware} from "@/lib/courseware-access";
import {prisma} from "@/lib/db";

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null),messageId=body?.messageId;
 if(typeof messageId!=="string"||!messageId||messageId.length>100)return NextResponse.json({error:"Invalid message"},{status:400});
 const {id:courseId}=await params;
 try{
  if(!await canAccessCourseware(session,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const message=await prisma.workspaceMessage.findFirst({where:{id:messageId,courseId},select:{id:true,createdAt:true}});
  if(!message)return NextResponse.json({error:"Message not found"},{status:404});
  // Concurrent tabs can only advance the read marker, never move it backwards.
  await prisma.$executeRaw`INSERT INTO "WorkspaceChatRead" ("courseId","userId","lastCreatedAt","lastMessageId","updatedAt") VALUES (${courseId},${session.userId},${message.createdAt},${message.id},NOW()) ON CONFLICT ("courseId","userId") DO UPDATE SET "lastCreatedAt"=EXCLUDED."lastCreatedAt", "lastMessageId"=EXCLUDED."lastMessageId", "updatedAt"=NOW() WHERE ("WorkspaceChatRead"."lastCreatedAt","WorkspaceChatRead"."lastMessageId") < (EXCLUDED."lastCreatedAt",EXCLUDED."lastMessageId")`;
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:"Unable to update read status"},{status:503});}
}
