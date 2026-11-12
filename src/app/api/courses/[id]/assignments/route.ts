import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assertCanTeachCourse} from "@/lib/course-teacher";
import {prisma} from "@/lib/db";
import {assignmentDraftInput,assignmentProgramId} from "@/lib/course-assignment-draft";
import {taskRequestId} from "@/lib/workspace-task-validation";

type Context={params:Promise<{id:string}>};
const select={id:true,programId:true,unitId:true,title:true,description:true,dueDate:true,version:true,createdAt:true,updatedAt:true} as const;
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;
 const allPrograms=request.nextUrl.searchParams.get("allPrograms")==="1";
 if(allPrograms&&(request.nextUrl.searchParams.has("programId")||request.nextUrl.searchParams.has("unitId")))return NextResponse.json({error:"Invalid scope"},{status:400});
 let programId:string|null;try{programId=assignmentProgramId(request.nextUrl.searchParams.get("programId"));}catch{return NextResponse.json({error:"Invalid course"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const rawUnit=request.nextUrl.searchParams.get("unitId"),unitFilter=rawUnit===null?{}:{unitId:rawUnit==="__default__"?null:assignmentProgramId(rawUnit)};
  const where={courseId,...(allPrograms?{}:{programId}),...unitFilter};
  const cursor=request.nextUrl.searchParams.get("cursor");
  if(cursor&&!await prisma.courseAssignmentDraft.findFirst({where:{id:cursor,...where},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.courseAssignmentDraft.findMany({where,select,orderBy:[{createdAt:"desc"},{id:"desc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const drafts=rows.slice(0,100);return NextResponse.json({drafts,nextCursor:rows.length>100?drafts.at(-1)!.id:null},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load drafts"},{status:503});}
}
export async function POST(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;let input:ReturnType<typeof assignmentDraftInput>,programId:string|null,unitId:string|null,requestId:string;
 try{const body=await request.json();input=assignmentDraftInput(body);programId=assignmentProgramId(body.programId);unitId=assignmentProgramId(body.unitId);requestId=taskRequestId(request.headers.get("Idempotency-Key"));}catch{return NextResponse.json({error:"Invalid assignment"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const key={courseId,creatorId:user.userId,requestId};
  const replay=async()=>{
   const receipt=await prisma.courseAssignmentCreationReceipt.findUnique({where:{courseId_creatorId_requestId:key}});
   if(!receipt)return null;
   if(receipt.programId!==programId||receipt.unitId!==unitId||receipt.title!==input.title||receipt.description!==input.description||receipt.dueDate!==input.dueDate)return NextResponse.json({error:"Request already used"},{status:409});
   const draft=await prisma.courseAssignmentDraft.findFirst({where:{id:receipt.draftId,courseId},select});
   if(!draft&&request.headers.get("X-Assignment-Recovery")!=="1")return NextResponse.json({error:"Draft was deleted"},{status:410});
   return NextResponse.json({draft,deleted:!draft},{status:200});
  };
  const previous=await replay();if(previous)return previous;
  if(programId&&!await prisma.courseProgram.findFirst({where:{id:programId,courseId},select:{id:true}}))return NextResponse.json({error:"Course unavailable"},{status:404});
  if(unitId&&!await prisma.courseProgramUnit.findFirst({where:{id:unitId,courseId,programId},select:{id:true}}))return NextResponse.json({error:"Unit unavailable"},{status:404});
  try{
   const draft=await prisma.$transaction(async tx=>{
    const saved=await tx.courseAssignmentDraft.create({data:{...key,programId,unitId,...input},select});
    await tx.courseAssignmentCreationReceipt.create({data:{...key,draftId:saved.id,programId,unitId,...input}});
    return saved;
   });
   return NextResponse.json({draft},{status:201});
  }catch(error){
   if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002"){const result=await replay();if(result)return result;}
   throw error;
  }
 }catch(error){const name=error instanceof Error?error.name:"unknown",code=typeof error==="object"&&error&&"code" in error?String(error.code):"none";console.error(`[assignment:create] ${name} ${code}`);return NextResponse.json({error:"Unable to save draft"},{status:503});}
}
