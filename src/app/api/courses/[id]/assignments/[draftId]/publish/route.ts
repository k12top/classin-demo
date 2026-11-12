import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assertCanTeachCourse,userCanTeachCourse} from "@/lib/course-teacher";
import {prisma} from "@/lib/db";
import {taskRequestId} from "@/lib/workspace-task-validation";

type Context={params:Promise<{id:string;draftId:string}>};
class PublishConflict extends Error {}
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,draftId}=await params;
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const result=await prisma.coursePublishedAssignment.findFirst({where:{courseId,sourceDraftId:draftId},select:{id:true}});
  return NextResponse.json({published:Boolean(result)},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load publication status"},{status:503});}
}
export async function POST(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,draftId}=await params;let requestId:string,version:number;
 try{requestId=taskRequestId(request.headers.get("Idempotency-Key"));const body=await request.json();version=body.version;if(!Number.isSafeInteger(version)||version<0)throw new Error();}catch{return NextResponse.json({error:"Invalid publication"},{status:400});}
 if(user.role!=="teacher")return NextResponse.json({error:"Forbidden"},{status:403});
 try{
  const assignment=await prisma.$transaction(async tx=>{
   const course=await tx.course.findUnique({where:{id:courseId},include:{teachers:true}});
   if(!course||!userCanTeachCourse(course,[user.userId,user.name||""]))throw new PublishConflict("Forbidden");
   const prior=await tx.coursePublishedAssignment.findUnique({where:{courseId_publisherId_requestId:{courseId,publisherId:user.userId,requestId}}});
   if(prior){if(prior.sourceDraftId!==draftId||prior.sourceVersion!==version)throw new PublishConflict("Request already used");return prior;}
   if(await tx.coursePublishedAssignment.findUnique({where:{sourceDraftId:draftId},select:{id:true}}))throw new PublishConflict("Draft already published");
   const source=await tx.courseAssignmentDraft.findFirst({where:{id:draftId,courseId,version}});
   if(!source)throw new PublishConflict("Draft changed or unavailable");
   return tx.coursePublishedAssignment.create({data:{courseId,programId:source.programId,unitId:source.unitId,sourceDraftId:draftId,sourceVersion:version,publisherId:user.userId,requestId,title:source.title,description:source.description,dueDate:source.dueDate}});
  },{isolationLevel:"Serializable"});
  const {id,programId,unitId,title,description,dueDate,publishedAt}=assignment;
  return NextResponse.json({assignment:{id,programId,unitId,title,description,dueDate,publishedAt}},{status:200,headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof PublishConflict)return NextResponse.json({error:error.message},{status:error.message==="Forbidden"?403:409});
  if(typeof error==="object"&&error&&"code" in error&&(error.code==="P2034"||error.code==="P2002"))return NextResponse.json({error:"Publication is being updated; retry safely"},{status:503});
  console.error(`[assignment:publish] ${error instanceof Error?error.name:"unknown"}`);return NextResponse.json({error:"Unable to publish assignment"},{status:503});
 }
}
