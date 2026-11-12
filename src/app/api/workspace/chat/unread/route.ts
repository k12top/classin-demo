import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {canAccessCourseware} from "@/lib/courseware-access";
import {prisma} from "@/lib/db";

export async function POST(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!Array.isArray(body?.courseIds)||body.courseIds.length>10||body.courseIds.some((id:unknown)=>typeof id!=="string"||!id||id.length>100))return NextResponse.json({error:"Invalid courses"},{status:400});
 const ids=[...new Set<string>(body.courseIds)];
 try{
  const allowed=(await Promise.all(ids.map(async id=>await canAccessCourseware(session,id)?id:null))).filter((id):id is string=>id!==null);
  const reads=await prisma.workspaceChatRead.findMany({where:{userId:session.userId,courseId:{in:allowed}}});
  const counts=await Promise.all(allowed.map(async courseId=>{const read=reads.find(value=>value.courseId===courseId);return [courseId,await prisma.workspaceMessage.count({where:{courseId,senderId:{not:session.userId},...(read?{OR:[{createdAt:{gt:read.lastCreatedAt}},{createdAt:read.lastCreatedAt,id:{gt:read.lastMessageId}}]}:{})}})] as const;}));
  const previews=await Promise.all(allowed.map(async courseId=>[courseId,await prisma.workspaceMessage.findFirst({where:{courseId},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{content:true,createdAt:true}})] as const));
  return NextResponse.json({counts:Object.fromEntries(counts),previews:Object.fromEntries(previews)},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to load unread counts"},{status:503});}
}
