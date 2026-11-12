import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {coursewareFileResponse} from "@/lib/courseware-file-response";

export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=await getSessionFromRequest(request);if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id}=await params;
 try{
  const item=await prisma.workspaceDriveItem.findFirst({where:{id,userId:session.userId,kind:"file",status:"ready"},select:{name:true,objectKey:true}});
  if(!item?.objectKey)return NextResponse.json({error:"File not found"},{status:404});
  const response=await coursewareFileResponse({name:item.name,url:`oss://${item.objectKey}`},request.nextUrl.searchParams.get("preview")==="1",request.headers.get("range"));
  // A successful preview/download is an access, not a file modification.
  // Keep metadata failures from interrupting an already available file.
  if(response.ok)try{await prisma.$executeRaw`UPDATE "WorkspaceDriveItem" SET "lastOpenedAt"=NOW() WHERE "id"=${id} AND "userId"=${session.userId} AND "status"='ready'`;}catch{/* Recent history is best effort. */}
  return response;
 }catch{return NextResponse.json({error:"File unavailable"},{status:503});}
}
