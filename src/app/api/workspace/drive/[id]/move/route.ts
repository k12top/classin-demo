import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {driveParent,drivePublicSelect} from "@/lib/workspace-drive";
import {isExplicitInstant} from "@/lib/time-zone";

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params;
 let parentId:string|null,updatedAt:Date;
 try{const body=await request.json();if(!body||!Object.hasOwn(body,"parentId"))throw new Error("Invalid folder");parentId=driveParent(body.parentId);if(!isExplicitInstant(body.updatedAt))throw new Error("Invalid version");updatedAt=new Date(body.updatedAt);}catch{return NextResponse.json({error:"Invalid move"},{status:400});}
 try{
  const result=await prisma.$transaction(async tx=>{
   const item=await tx.workspaceDriveItem.findFirst({where:{id,userId:session.userId,status:"ready"},select:drivePublicSelect});
   if(!item)return {status:404,error:"File not found"} as const;
   if(item.parentId===parentId)return {status:200,item} as const;
   if(item.updatedAt.getTime()!==updatedAt.getTime())return {status:409,error:"File changed; refresh and retry"} as const;
   let ancestor=parentId;const seen=new Set<string>();
   while(ancestor){
    if(ancestor===id||seen.has(ancestor)||seen.size>=256)return {status:400,error:"Invalid destination"} as const;
    seen.add(ancestor);
    const folder=await tx.workspaceDriveItem.findFirst({where:{id:ancestor,userId:session.userId,kind:"folder",status:"ready"},select:{parentId:true}});
    if(!folder)return {status:404,error:"Folder not found"} as const;
    ancestor=folder.parentId;
   }
   const changed=await tx.workspaceDriveItem.updateMany({where:{id,userId:session.userId,status:"ready",updatedAt},data:{parentId}});
   if(!changed.count)return {status:409,error:"File changed; refresh and retry"} as const;
   return {status:200,item:await tx.workspaceDriveItem.findFirst({where:{id,userId:session.userId,status:"ready"},select:drivePublicSelect})} as const;
  },{isolationLevel:"Serializable"});
  return result.status===200?NextResponse.json({item:result.item}):NextResponse.json({error:result.error},{status:result.status});
 }catch(error){if((error as {code?:string})?.code==="P2034")return NextResponse.json({error:"Folder changed; refresh and retry"},{status:409});return NextResponse.json({error:"Unable to move file"},{status:503});}
}
