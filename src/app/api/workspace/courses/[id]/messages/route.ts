import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {canAccessCourseware} from "@/lib/courseware-access";
import {chatCharacterCount,CLASSROOM_CHAT_MAX_CHARACTERS} from "@/lib/classroom/chat-content";
import {taskRequestId} from "@/lib/workspace-task-validation";

type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Context){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;
 try{
  if(!await canAccessCourseware(session,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const before=request.nextUrl.searchParams.get("before"),after=request.nextUrl.searchParams.get("after");
  if(before&&after)return NextResponse.json({error:"Invalid cursor"},{status:400});
  const cursor=before||after;
  if(cursor&&!await prisma.workspaceMessage.findFirst({where:{id:cursor,courseId},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const direction=after?"asc":"desc";
  const rows=await prisma.workspaceMessage.findMany({where:{courseId},orderBy:[{createdAt:direction},{id:direction}],take:51,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const page=rows.slice(0,50);
  return NextResponse.json({messages:after?page:page.reverse(),nextCursor:rows.length>50?rows[49].id:null},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to load messages"},{status:503});}
}

export async function POST(request:NextRequest,{params}:Context){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;
 let content:string,clientId:string;
 try{const body=await request.json();content=typeof body?.content==="string"?body.content.trim():"";clientId=taskRequestId(body?.clientId);if(!content||chatCharacterCount(content)>CLASSROOM_CHAT_MAX_CHARACTERS)throw new Error("Invalid message length");}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid message"},{status:400});}
 try{
  if(!await canAccessCourseware(session,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const message=await prisma.workspaceMessage.upsert({where:{courseId_senderId_clientId:{courseId,senderId:session.userId,clientId}},create:{courseId,senderId:session.userId,senderName:session.displayName||session.name||session.userId,clientId,content},update:{}});
  if(message.content!==content)return NextResponse.json({error:"Message id already used"},{status:409});
  return NextResponse.json({message},{status:201});
 }catch{return NextResponse.json({error:"Unable to send message"},{status:503});}
}
