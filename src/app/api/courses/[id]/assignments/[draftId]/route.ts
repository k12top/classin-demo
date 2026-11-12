import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assertCanTeachCourse} from "@/lib/course-teacher";
import {prisma} from "@/lib/db";
import {assignmentDraftInput} from "@/lib/course-assignment-draft";
import {taskRequestId} from "@/lib/workspace-task-validation";
type Context={params:Promise<{id:string;draftId:string}>};
export async function DELETE(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,draftId}=await params;let version:number;
 try{const body=await request.json();version=body.version;if(!Number.isSafeInteger(version)||version<0)throw new Error();}catch{return NextResponse.json({error:"Invalid draft version"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const result=await prisma.courseAssignmentDraft.deleteMany({where:{id:draftId,courseId,version}});
  if(!result.count)return NextResponse.json({error:"Draft changed or unavailable"},{status:409});
  return NextResponse.json({deleted:true});
 }catch{return NextResponse.json({error:"Unable to delete draft"},{status:503});}
}
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,draftId}=await params;
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const draft=await prisma.courseAssignmentDraft.findFirst({where:{id:draftId,courseId},select:{id:true,programId:true,unitId:true,title:true,description:true,dueDate:true,version:true}});
  return draft?NextResponse.json({draft},{headers:{"Cache-Control":"private, no-store"}}):NextResponse.json({error:"Draft not found"},{status:404});
 }catch{return NextResponse.json({error:"Unable to load draft"},{status:503});}
}
export async function PATCH(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,draftId}=await params;let input:ReturnType<typeof assignmentDraftInput>,version:number,editRequestId:string|null;
 try{const body=await request.json();input=assignmentDraftInput(body);version=body.version;const key=request.headers.get("Idempotency-Key");editRequestId=key===null?null:taskRequestId(key);if(!Number.isSafeInteger(version)||version<0)throw new Error();}catch{return NextResponse.json({error:"Invalid assignment"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const updated=await prisma.courseAssignmentDraft.updateMany({where:{id:draftId,courseId,version},data:{...input,version:{increment:1},lastEditRequestId:editRequestId,lastEditActorId:editRequestId?user.userId:null}});
  const row=await prisma.courseAssignmentDraft.findFirst({where:{id:draftId,courseId},select:{id:true,programId:true,unitId:true,title:true,description:true,dueDate:true,version:true,createdAt:true,updatedAt:true,lastEditRequestId:true,lastEditActorId:true}});
  if(!row||row.version!==version+1||(!updated.count&&(!editRequestId||row.lastEditRequestId!==editRequestId||row.lastEditActorId!==user.userId||row.title!==input.title||row.description!==input.description||row.dueDate!==input.dueDate)))return NextResponse.json({error:"Draft changed or unavailable"},{status:409});
  const draft={id:row.id,programId:row.programId,unitId:row.unitId,title:row.title,description:row.description,dueDate:row.dueDate,version:row.version,createdAt:row.createdAt,updatedAt:row.updatedAt};
  return NextResponse.json({draft});
 }catch{return NextResponse.json({error:"Unable to save draft"},{status:503});}
}
