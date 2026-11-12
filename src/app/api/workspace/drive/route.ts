import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {driveName,driveParent,drivePublicSelect} from "@/lib/workspace-drive";
import {taskRequestId} from "@/lib/workspace-task-validation";

export async function GET(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 let parentId:string|null;try{parentId=driveParent(request.nextUrl.searchParams.get("parentId"));}catch{return NextResponse.json({error:"Invalid folder"},{status:400});}
 try{
  if(parentId&&!await prisma.workspaceDriveItem.findFirst({where:{id:parentId,userId:session.userId,kind:"folder",status:"ready"},select:{id:true}}))return NextResponse.json({error:"Folder not found"},{status:404});
  const cursor=request.nextUrl.searchParams.get("cursor"),where={userId:session.userId,parentId,status:"ready"};
  if(cursor&&!await prisma.workspaceDriveItem.findFirst({where:{...where,id:cursor},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.workspaceDriveItem.findMany({where,select:drivePublicSelect,orderBy:[{createdAt:"desc"},{id:"desc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  return NextResponse.json({items:rows.slice(0,100),nextCursor:rows.length>100?rows[99].id:null},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to load files"},{status:503});}
}

export async function POST(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 let name:string,parentId:string|null,requestId:string;
 try{const body=await request.json();name=driveName(body?.name);parentId=driveParent(body?.parentId);requestId=taskRequestId(request.headers.get("Idempotency-Key"));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid folder"},{status:400});}
 try{
  const item=await prisma.$transaction(async tx=>{
   if(parentId&&!await tx.workspaceDriveItem.findFirst({where:{id:parentId,userId:session.userId,kind:"folder",status:"ready"},select:{id:true}}))return null;
   return tx.workspaceDriveItem.upsert({where:{userId_requestId:{userId:session.userId,requestId}},create:{userId:session.userId,requestId,parentId,name,kind:"folder"},update:{},select:drivePublicSelect});
  },{isolationLevel:"Serializable"});
  if(!item)return NextResponse.json({error:"Folder not found"},{status:404});
  if(item.kind!=="folder"||item.name!==name||item.parentId!==parentId)return NextResponse.json({error:"Request id already used"},{status:409});
  if(item.status!=="ready")return NextResponse.json({error:"Folder is unavailable"},{status:409});
  return NextResponse.json({item},{status:201});
 }catch{return NextResponse.json({error:"Unable to create folder"},{status:503});}
}
