import { NextRequest,NextResponse } from "next/server";
import { activityActor,activityFailure } from "@/lib/classroom/server/activity-route";
import { classroomMessageAccess } from "@/lib/classroom/server/message-access";
import { parseImageMessage } from "@/lib/classroom/chat-image-message";
import { readChatImageObject } from "@/lib/classroom/server/chat-images";
import { prisma } from "@/lib/db";
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{sessionId:string;messageId:string}>}){
 try{const {sessionId,messageId}=await params,actor=await activityActor(request,sessionId,request.nextUrl.searchParams.get('shareAccess')||undefined);if(actor instanceof NextResponse)return actor;
 const message=await prisma.classroomMessage.findFirst({where:{AND:[classroomMessageAccess(actor.sessionId,actor.userId,actor.role),{id:messageId,kind:'image',deletedAt:null}]}});
 const data=message&&parseImageMessage(message.content);if(!message||!data)return NextResponse.json({error:'Image not found'},{status:404});
 const image=await prisma.classroomChatImage.findFirst({where:{id:data.imageId,sessionId:actor.sessionId,uploaderId:message.senderId}});if(!image)return NextResponse.json({error:'Image not found'},{status:404});
 const bytes=await readChatImageObject(image.objectKey);return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Content-Length':String(bytes.length),'Content-Disposition':'inline; filename="classroom-image.webp"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return activityFailure(error)}
}
