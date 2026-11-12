import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {eventInput,eventRange} from "@/lib/workspace-event-validation";
import {taskRequestId} from "@/lib/workspace-task-validation";

export async function GET(request:NextRequest){
  const session=await getSessionFromRequest(request);
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  let range:ReturnType<typeof eventRange>;
  try{range=eventRange(request.nextUrl.searchParams.get("from"),request.nextUrl.searchParams.get("to"));}
  catch{return NextResponse.json({error:"Invalid event range"},{status:400});}
  const where={userId:session.userId,startsAt:{lt:range.to},endsAt:{gt:range.from}};
  const cursor=request.nextUrl.searchParams.get("cursor");
  try{
    if(cursor&&!await prisma.workspaceEvent.findFirst({where:{...where,id:cursor},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
    const rows=await prisma.workspaceEvent.findMany({where,orderBy:[{startsAt:"asc"},{id:"asc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});
    const events=rows.slice(0,100);
    return NextResponse.json({events,nextCursor:rows.length>100?events[events.length-1].id:null},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Unable to load events"},{status:503});}
}

export async function POST(request:NextRequest){
  const session=await getSessionFromRequest(request);
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  let input:ReturnType<typeof eventInput>,requestId:string;
  try{input=eventInput(await request.json());requestId=taskRequestId(request.headers.get("Idempotency-Key"));}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid event"},{status:400});}
  const lookup=async()=>{
    const receipt=await prisma.workspaceEventReceipt.findUnique({where:{userId_requestId:{userId:session.userId,requestId}}});
    if(!receipt)return null;
    if(receipt.title!==input.title||receipt.notes!==input.notes||receipt.timeZone!==input.timeZone||receipt.startsAt?.getTime()!==input.startsAt.getTime()||receipt.endsAt?.getTime()!==input.endsAt.getTime())return NextResponse.json({error:"Request id already used for a different or unknown event"},{status:409});
    const event=await prisma.workspaceEvent.findFirst({where:{id:receipt.eventId,userId:session.userId}});
    return event?NextResponse.json({event},{status:201}):NextResponse.json({error:"Original event was deleted"},{status:409});
  };
  try{
    const previous=await lookup();if(previous)return previous;
    const event=await prisma.$transaction(async tx=>{
      const event=await tx.workspaceEvent.create({data:{...input,userId:session.userId,requestId}});
      await tx.workspaceEventReceipt.create({data:{...input,userId:session.userId,requestId,eventId:event.id}});
      return event;
    });
    return NextResponse.json({event},{status:201});
  }catch(error){
    if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002"){
      try{return await lookup()||NextResponse.json({error:"Existing request cannot be verified"},{status:409});}catch{/* Report an unavailable database below. */}
    }
    return NextResponse.json({error:"Unable to save event"},{status:503});
  }
}
