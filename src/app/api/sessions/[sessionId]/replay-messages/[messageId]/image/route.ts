import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {resolveCoursewareAccess} from "@/lib/courseware-access";
import {classroomMessageAccess} from "@/lib/classroom/server/message-access";
import {parseImageMessage} from "@/lib/classroom/chat-image-message";
import {readChatImageObject} from "@/lib/classroom/server/chat-images";
import {prisma} from "@/lib/db";

export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:{params:Promise<{sessionId:string;messageId:string}>}){
 const identity=await getSessionFromRequest(request);if(!identity)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {sessionId,messageId}=await params;
 try{
  const lesson=await prisma.courseSession.findUnique({where:{id:sessionId},select:{courseId:true}});if(!lesson)return NextResponse.json({error:"Image not found"},{status:404});
  const access=await resolveCoursewareAccess(identity,lesson.courseId,sessionId);if(!access.allowed)return NextResponse.json({error:"Image not found"},{status:404});
  const visible=classroomMessageAccess(sessionId,identity.userId,access.observer?"observer":access.teaching?"teacher":"student");
  const message=await prisma.classroomMessage.findFirst({where:{AND:[visible,{id:messageId,kind:"image",deletedAt:null}]},select:{content:true,senderId:true}}),parsed=message&&parseImageMessage(message.content);
  if(!message||!parsed)return NextResponse.json({error:"Image not found"},{status:404});
  const image=await prisma.classroomChatImage.findFirst({where:{id:parsed.imageId,sessionId,uploaderId:message.senderId},select:{objectKey:true}});if(!image)return NextResponse.json({error:"Image not found"},{status:404});
  const bytes=await readChatImageObject(image.objectKey);
  return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Content-Length":String(bytes.length),"Content-Disposition":'inline; filename="classroom-image.webp"',"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return NextResponse.json({error:"Unable to load image"},{status:503});}
}
