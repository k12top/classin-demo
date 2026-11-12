import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {driveName,drivePublicSelect} from "@/lib/workspace-drive";
import {isExplicitInstant} from "@/lib/time-zone";

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params;
 let name:string,updatedAt:Date;
 try{const body=await request.json();name=driveName(body?.name);if(!isExplicitInstant(body?.updatedAt))throw new Error("Invalid version");updatedAt=new Date(body.updatedAt);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid file"},{status:400});}
 try{
  const changed=await prisma.workspaceDriveItem.updateMany({where:{id,userId:session.userId,status:"ready",updatedAt},data:{name}});
  if(!changed.count){const current=await prisma.workspaceDriveItem.findFirst({where:{id,userId:session.userId,status:"ready"},select:drivePublicSelect});if(!current)return NextResponse.json({error:"File not found"},{status:404});if(current.name===name)return NextResponse.json({item:current});return NextResponse.json({error:"File changed; refresh and retry"},{status:409});}
  const item=await prisma.workspaceDriveItem.findFirst({where:{id,userId:session.userId,status:"ready"},select:drivePublicSelect});
  return NextResponse.json({item});
 }catch{return NextResponse.json({error:"Unable to rename file"},{status:503});}
}

/** Move the entire visible subtree into a recoverable trash batch. */
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params;let updatedAt:Date;
 try{const body=await request.json();if(!isExplicitInstant(body?.updatedAt))throw new Error();updatedAt=new Date(body.updatedAt);}catch{return NextResponse.json({error:"Invalid version"},{status:400});}
 try{
  const result=await prisma.$transaction(async tx=>{
   const item=await tx.workspaceDriveItem.findFirst({where:{id,userId:session.userId},select:{id:true,status:true,trashRootId:true,updatedAt:true}});
   if(!item)return 404;
   if(item.status==="trashed"&&item.trashRootId===id)return 200;
   if(item.status!=="ready")return 404;
   if(item.updatedAt.getTime()!==updatedAt.getTime())return 409;
   await tx.$executeRaw`WITH RECURSIVE subtree AS (
     SELECT "id" FROM "WorkspaceDriveItem" WHERE "id"=${id} AND "userId"=${session.userId} AND "status" IN ('ready','pending')
     UNION SELECT child."id" FROM "WorkspaceDriveItem" child JOIN subtree parent ON child."parentId"=parent."id" WHERE child."userId"=${session.userId} AND child."status" IN ('ready','pending')
   ) UPDATE "WorkspaceDriveItem" SET "status"=CASE WHEN "status"='pending' THEN 'trashed-pending' ELSE 'trashed' END, "trashRootId"=${id}, "updatedAt"=NOW() WHERE "id" IN (SELECT "id" FROM subtree) AND "userId"=${session.userId}`;
   return 200;
  },{isolationLevel:"Serializable"});
  return result===200?NextResponse.json({ok:true}):NextResponse.json({error:result===404?"File not found":"File changed; refresh and retry"},{status:result});
 }catch(error){if((error as {code?:string})?.code==="P2034")return NextResponse.json({error:"Folder changed; refresh and retry"},{status:409});return NextResponse.json({error:"Unable to move to trash"},{status:503});}
}
