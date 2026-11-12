import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {authorizedDirectChat} from "@/lib/workspace-direct-chat";

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null),messageId=body?.messageId;if(typeof messageId!=="string"||!messageId||messageId.length>100)return NextResponse.json({error:"Invalid message"},{status:400});
 const {id:chatId}=await params;
 try{
  if(!await authorizedDirectChat(session,chatId))return NextResponse.json({error:"Not found"},{status:404});
  const message=await prisma.workspaceDirectMessage.findFirst({where:{id:messageId,chatId},select:{id:true,createdAt:true}});if(!message)return NextResponse.json({error:"Message not found"},{status:404});
  await prisma.$executeRaw`INSERT INTO "WorkspaceDirectRead" ("chatId","userId","lastCreatedAt","lastMessageId","updatedAt") VALUES (${chatId},${session.userId},${message.createdAt},${message.id},NOW()) ON CONFLICT ("chatId","userId") DO UPDATE SET "lastCreatedAt"=EXCLUDED."lastCreatedAt", "lastMessageId"=EXCLUDED."lastMessageId", "updatedAt"=NOW() WHERE ("WorkspaceDirectRead"."lastCreatedAt","WorkspaceDirectRead"."lastMessageId") < (EXCLUDED."lastCreatedAt",EXCLUDED."lastMessageId")`;
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:"Unable to update read status"},{status:503});}
}
