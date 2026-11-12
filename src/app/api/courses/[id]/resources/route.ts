import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/db";
import {getSessionFromRequest} from "@/lib/session";
import {getCoursewareOssClient} from "@/lib/aliyun-oss";
import {driveName} from "@/lib/workspace-drive";
import {assignmentProgramId} from "@/lib/course-assignment-draft";
import {taskRequestId} from "@/lib/workspace-task-validation";
import {resourceAccess,programResourceKey,resourceSelect} from "@/lib/course-program-resource";
type Context={params:Promise<{id:string}>};
export const runtime="nodejs";
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;let programId:string|null;
 try{programId=assignmentProgramId(request.nextUrl.searchParams.get("programId"));}catch{return NextResponse.json({error:"Invalid course"},{status:400});}
 try{
  if(!(await resourceAccess(user,courseId,programId)).allowed)return NextResponse.json({error:"Forbidden"},{status:403});
  const rawUnit=request.nextUrl.searchParams.get("unitId"),unitFilter=rawUnit===null?{}:{unitId:rawUnit==="__default__"?null:assignmentProgramId(rawUnit)};
  const cursor=request.nextUrl.searchParams.get("cursor"),where={courseId,programId,status:"ready",...unitFilter};
  if(cursor&&!await prisma.courseProgramResource.findFirst({where:{...where,id:cursor},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.courseProgramResource.findMany({where,select:resourceSelect,orderBy:[{createdAt:"desc"},{id:"desc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const resources=rows.slice(0,100);return NextResponse.json({resources,nextCursor:rows.length>100?resources.at(-1)!.id:null},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load resources"},{status:503});}
}
export async function POST(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;let sourceId:string,name:string,programId:string|null,unitId:string|null,requestId:string;
 try{const body=await request.json();name=driveName(body.name);if(name.length>80||typeof body.sourceId!=="string"||!body.sourceId||body.sourceId.length>100)throw new Error();sourceId=body.sourceId;programId=assignmentProgramId(body.programId);unitId=assignmentProgramId(body.unitId);requestId=taskRequestId(request.headers.get("Idempotency-Key"));}catch{return NextResponse.json({error:"Invalid resource"},{status:400});}
 try{
  if(!(await resourceAccess(user,courseId,programId)).canManage)return NextResponse.json({error:"Forbidden"},{status:403});
  if(programId&&!await prisma.courseProgram.findFirst({where:{id:programId,courseId},select:{id:true}}))return NextResponse.json({error:"Course unavailable"},{status:404});
  if(unitId&&!await prisma.courseProgramUnit.findFirst({where:{id:unitId,courseId,programId},select:{id:true}}))return NextResponse.json({error:"Unit unavailable"},{status:404});
  const unique={courseId_creatorId_requestId:{courseId,creatorId:user.userId,requestId}};
  let item=await prisma.courseProgramResource.findUnique({where:unique});
  if(!item){
   const file=await prisma.workspaceDriveItem.findFirst({where:{id:sourceId,userId:user.userId,status:"ready",kind:"file"},select:{objectKey:true,size:true}});
   if(!file?.objectKey)return NextResponse.json({error:"Drive file unavailable"},{status:404});
   try{
    item=await prisma.courseProgramResource.upsert({where:unique,create:{courseId,programId,unitId,creatorId:user.userId,requestId,sourceId,sourceObjectKey:file.objectKey,objectKey:programResourceKey(courseId,user.userId,requestId),name,size:file.size},update:{}});
   }catch(error){
    if(!(error&&typeof error==="object"&&"code" in error&&error.code==="P2002"))throw error;
    item=await prisma.courseProgramResource.findUnique({where:unique});
    if(!item)throw error;
   }
  }
  if(item.sourceId!==sourceId||item.programId!==programId||item.unitId!==unitId||item.name!==name||item.status==="removed")return NextResponse.json({error:"Request already used"},{status:409});
  if(item.status!=="ready"){
   await getCoursewareOssClient().copy(item.objectKey,item.sourceObjectKey);
   await prisma.courseProgramResource.updateMany({where:{id:item.id,status:"pending"},data:{status:"ready"}});
   item=await prisma.courseProgramResource.findUniqueOrThrow({where:{id:item.id}});
   if(item.status!=="ready")return NextResponse.json({error:"Resource was removed"},{status:409});
  }
  return NextResponse.json({resource:{id:item.id,programId:item.programId,unitId:item.unitId,name:item.name,size:item.size,status:item.status,createdAt:item.createdAt}},{status:201});
 }catch{return NextResponse.json({error:"Unable to add resource; retry safely"},{status:503});}
}
