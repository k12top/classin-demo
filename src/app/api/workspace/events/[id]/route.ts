import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {eventInput} from "@/lib/workspace-event-validation";

type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,{params}:Context){
  const session=await getSessionFromRequest(request);
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  let input:ReturnType<typeof eventInput>,version:number;
  try{const value=await request.json();if(!Number.isSafeInteger(value?.version)||value.version<0)throw new Error("Invalid version");version=value.version;input=eventInput(value);}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid event"},{status:400});}
  try{
    const changed=await prisma.workspaceEvent.updateMany({where:{id,userId:session.userId,version},data:{...input,version:{increment:1}}});
    if(!changed.count){const exists=await prisma.workspaceEvent.findFirst({where:{id,userId:session.userId},select:{id:true}});return NextResponse.json({error:exists?"Event changed; refresh and retry":"Event not found"},{status:exists?409:404});}
    return NextResponse.json({event:await prisma.workspaceEvent.findFirst({where:{id,userId:session.userId}})});
  }catch{return NextResponse.json({error:"Unable to update event"},{status:503});}
}

export async function DELETE(request:NextRequest,{params}:Context){
  const session=await getSessionFromRequest(request);
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  let version:number;
  try{const value=await request.json();if(!Number.isSafeInteger(value?.version)||value.version<0)throw new Error("Invalid version");version=value.version;}
  catch{return NextResponse.json({error:"Invalid version"},{status:400});}
  try{
    const result=await prisma.workspaceEvent.deleteMany({where:{id,userId:session.userId,version}});
    if(!result.count){const exists=await prisma.workspaceEvent.findFirst({where:{id,userId:session.userId},select:{id:true}});return NextResponse.json({error:exists?"Event changed; refresh and retry":"Event not found"},{status:exists?409:404});}
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({error:"Unable to delete event"},{status:503});}
}
