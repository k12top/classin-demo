import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/db";
import {getSessionFromRequest} from "@/lib/session";
import {assignmentSubmissionAccess,assignmentSubmissionInput} from "@/lib/course-assignment-submissions";
import {taskRequestId} from "@/lib/workspace-task-validation";
import {assignmentSubmissionSelect as select} from "@/lib/course-assignment-submission-select";

type Context={params:Promise<{id:string;assignmentId:string}>};
function visibleToStudent<T extends {version:number;review:{submissionVersion:number}|null}>(submission:T|null){return submission&&submission.review?.submissionVersion!==submission.version?{...submission,review:null}:submission;}
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,assignmentId}=await params;
 try{
  const assignment=await prisma.coursePublishedAssignment.findFirst({where:{id:assignmentId,courseId},select:{programId:true}});if(!assignment)return NextResponse.json({error:"Assignment unavailable"},{status:404});
  const access=await assignmentSubmissionAccess(prisma,user,courseId,assignment.programId);if(!access.teacher&&!access.student)return NextResponse.json({error:"Forbidden"},{status:403});
  if(access.student){const submission=await prisma.courseAssignmentSubmission.findUnique({where:{assignmentId_studentId:{assignmentId,studentId:user.userId}},select});return NextResponse.json({submission:visibleToStudent(submission),canSubmit:true},{headers:{"Cache-Control":"private, no-store"}});}
  const cursor=request.nextUrl.searchParams.get("cursor");if(cursor&&!await prisma.courseAssignmentSubmission.findFirst({where:{id:cursor,assignmentId},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.courseAssignmentSubmission.findMany({where:{assignmentId},select,orderBy:[{submittedAt:"desc"},{id:"desc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});const submissions=rows.slice(0,100);
  return NextResponse.json({submissions,nextCursor:rows.length>100?submissions.at(-1)!.id:null,canSubmit:false},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load submissions"},{status:503});}
}
class SubmissionConflict extends Error {}
export async function POST(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,assignmentId}=await params;let requestId:string,input:ReturnType<typeof assignmentSubmissionInput>;
 try{requestId=taskRequestId(request.headers.get("Idempotency-Key"));input=assignmentSubmissionInput(await request.json());}catch{return NextResponse.json({error:"Invalid submission"},{status:400});}
 try{
  const submission=await prisma.$transaction(async tx=>{
   const assignment=await tx.coursePublishedAssignment.findFirst({where:{id:assignmentId,courseId},select:{programId:true}});if(!assignment)throw new SubmissionConflict("Assignment unavailable");
   const access=await assignmentSubmissionAccess(tx,user,courseId,assignment.programId,{sequential:true});if(!access.student)throw new SubmissionConflict("Forbidden");
   const receipt=await tx.courseAssignmentSubmissionReceipt.findUnique({where:{assignmentId_studentId_requestId:{assignmentId,studentId:user.userId,requestId}}});
   if(receipt){if(receipt.content!==input.content||receipt.expectedVersion!==input.expectedVersion)throw new SubmissionConflict("Request already used");const current=await tx.courseAssignmentSubmission.findUnique({where:{assignmentId_studentId:{assignmentId,studentId:user.userId}},select});if(!current)throw new SubmissionConflict("Submission unavailable");return current;}
   let saved;
   if(input.expectedVersion===null){if(await tx.courseAssignmentSubmission.findUnique({where:{assignmentId_studentId:{assignmentId,studentId:user.userId}},select:{id:true}}))throw new SubmissionConflict("Submission changed");saved=await tx.courseAssignmentSubmission.create({data:{assignmentId,studentId:user.userId,studentName:user.displayName||user.name||user.userId,content:input.content},select});}
   else{const changed=await tx.courseAssignmentSubmission.updateMany({where:{assignmentId,studentId:user.userId,version:input.expectedVersion},data:{content:input.content,studentName:user.displayName||user.name||user.userId,version:{increment:1}}});if(!changed.count)throw new SubmissionConflict("Submission changed");saved=await tx.courseAssignmentSubmission.findUniqueOrThrow({where:{assignmentId_studentId:{assignmentId,studentId:user.userId}},select});}
   await tx.courseAssignmentSubmissionReceipt.create({data:{assignmentId,studentId:user.userId,requestId,content:input.content,expectedVersion:input.expectedVersion,resultVersion:saved.version}});
   return saved;
  },{isolationLevel:"Serializable"});
  return NextResponse.json({submission:visibleToStudent(submission)},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof SubmissionConflict)return NextResponse.json({error:error.message},{status:error.message==="Forbidden"?403:error.message==="Assignment unavailable"?404:409});
  if(typeof error==="object"&&error&&"code" in error&&(error.code==="P2034"||error.code==="P2002"))return NextResponse.json({error:"Submission is being updated; retry safely"},{status:503});
  console.error(`[assignment:submit] ${error instanceof Error?error.name:"unknown"}`);return NextResponse.json({error:"Unable to save submission"},{status:503});
 }
}
