import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {isExplicitInstant} from "@/lib/time-zone";

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params;let updatedAt:Date;
 try{const body=await request.json();if(!isExplicitInstant(body?.updatedAt))throw new Error();updatedAt=new Date(body.updatedAt);}catch{return NextResponse.json({error:"Invalid version"},{status:400});}
 try{
  const result=await prisma.$transaction(async tx=>{
   const item=await tx.workspaceDriveItem.findFirst({where:{id,userId:session.userId},select:{status:true,trashRootId:true,updatedAt:true,parentId:true}});
   if(!item)return 404;if(item.status==="ready")return 200;
   if(item.status!=="trashed"||item.trashRootId!==id)return 404;
   if(item.updatedAt.getTime()!==updatedAt.getTime())return 409;
   const parentReady=!item.parentId||Boolean(await tx.workspaceDriveItem.findFirst({where:{id:item.parentId,userId:session.userId,kind:"folder",status:"ready"},select:{id:true}}));
   await tx.$executeRaw`UPDATE "WorkspaceDriveItem" SET "status"=CASE WHEN "status"='trashed-pending' THEN 'pending' ELSE 'ready' END, "trashRootId"=NULL, "updatedAt"=NOW() WHERE "userId"=${session.userId} AND "trashRootId"=${id} AND "status" IN ('trashed','trashed-pending')`;
   if(!parentReady)await tx.workspaceDriveItem.updateMany({where:{id,userId:session.userId,status:"ready"},data:{parentId:null}});
   return 200;
  },{isolationLevel:"Serializable"});
  return result===200?NextResponse.json({ok:true}):NextResponse.json({error:result===404?"File not found":"File changed; refresh and retry"},{status:result});
 }catch(error){if((error as {code?:string})?.code==="P2034")return NextResponse.json({error:"Folder changed; refresh and retry"},{status:409});return NextResponse.json({error:"Unable to restore file"},{status:503});}
}
