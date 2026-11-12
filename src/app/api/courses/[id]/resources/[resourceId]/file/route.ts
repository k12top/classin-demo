import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {resourceAccess} from "@/lib/course-program-resource";
import {coursewareFileResponse} from "@/lib/courseware-file-response";
type Context={params:Promise<{id:string;resourceId:string}>};
export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,resourceId}=await params;
 try{
  const item=await prisma.courseProgramResource.findFirst({where:{id:resourceId,courseId,status:"ready"},select:{programId:true,objectKey:true,name:true}});
  if(!item||!(await resourceAccess(user,courseId,item.programId)).allowed)return NextResponse.json({error:"Resource not found"},{status:404});
  return await coursewareFileResponse({name:item.name,url:`oss://${item.objectKey}`},request.nextUrl.searchParams.get("preview")==="1",request.headers.get("range"));
 }catch{return NextResponse.json({error:"Resource unavailable"},{status:503});}
}
