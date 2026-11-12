import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {getAliyunOssClient} from "@/lib/aliyun-oss";
import {drivePublicSelect} from "@/lib/workspace-drive";

export const runtime="nodejs";
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params;
 try{
  const item=await prisma.workspaceDriveItem.findFirst({where:{id,userId:session.userId,kind:"file"}});
  if(!item||!item.objectKey)return NextResponse.json({error:"File not found"},{status:404});
  if(item.status==="ready")return NextResponse.json({item:await prisma.workspaceDriveItem.findFirst({where:{id,userId:session.userId},select:drivePublicSelect})});
  if(item.status!=="pending")return NextResponse.json({error:"File unavailable"},{status:409});
  const result=await getAliyunOssClient().head(item.objectKey);
  const headers=result.res.headers as Record<string,string|undefined>;
  if(Number(headers["content-length"])!==item.size)return NextResponse.json({error:"Uploaded file size does not match"},{status:409});
  const ready=await prisma.$transaction(async tx=>{
   const current=await tx.workspaceDriveItem.findFirst({where:{id,userId:session.userId,kind:"file"}});
   if(!current)return null;
   if(current.status==="ready")return tx.workspaceDriveItem.findFirst({where:{id,userId:session.userId},select:drivePublicSelect});
   if(current.status!=="pending")return null;
   if(current.parentId&&!await tx.workspaceDriveItem.findFirst({where:{id:current.parentId,userId:session.userId,kind:"folder",status:"ready"},select:{id:true}}))return null;
   const changed=await tx.workspaceDriveItem.updateMany({where:{id,userId:session.userId,status:"pending"},data:{status:"ready"}});
   return changed.count?tx.workspaceDriveItem.findFirst({where:{id,userId:session.userId,status:"ready"},select:drivePublicSelect}):null;
  },{isolationLevel:"Serializable"});
  return ready?NextResponse.json({item:ready}):NextResponse.json({error:"File unavailable"},{status:409});
 }catch{return NextResponse.json({error:"Upload could not be verified"},{status:503});}
}
