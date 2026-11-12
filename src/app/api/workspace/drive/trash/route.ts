import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {drivePublicSelect} from "@/lib/workspace-drive";

export async function GET(request:NextRequest){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{
  const cursor=request.nextUrl.searchParams.get("cursor"),where={userId:session.userId,status:"trashed",trashRootId:{equals:prisma.workspaceDriveItem.fields.id}};
  if(cursor&&!await prisma.workspaceDriveItem.findFirst({where:{id:cursor,userId:session.userId,status:"trashed",trashRootId:cursor},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.workspaceDriveItem.findMany({where,select:drivePublicSelect,orderBy:[{updatedAt:"desc"},{id:"desc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  return NextResponse.json({items:rows.slice(0,100),nextCursor:rows.length>100?rows[99].id:null},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to load trash"},{status:503});}
}
