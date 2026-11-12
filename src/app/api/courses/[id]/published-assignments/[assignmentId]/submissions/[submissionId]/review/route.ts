import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/db";
import {getSessionFromRequest} from "@/lib/session";
import {assignmentSubmissionAccess} from "@/lib/course-assignment-submissions";
import {assignmentReviewInput} from "@/lib/course-assignment-review";
import {taskRequestId} from "@/lib/workspace-task-validation";

type Context={params:Promise<{id:string;assignmentId:string;submissionId:string}>};
const select={submissionVersion:true,reviewerName:true,result:true,feedback:true,version:true,updatedAt:true} as const;
class ReviewConflict extends Error {}
export async function POST(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,assignmentId,submissionId}=await params;let requestId:string,input:ReturnType<typeof assignmentReviewInput>;
 try{requestId=taskRequestId(request.headers.get("Idempotency-Key"));input=assignmentReviewInput(await request.json());}catch{return NextResponse.json({error:"Invalid review"},{status:400});}
 try{
  const review=await prisma.$transaction(async tx=>{
   const assignment=await tx.coursePublishedAssignment.findFirst({where:{id:assignmentId,courseId},select:{programId:true}});if(!assignment)throw new ReviewConflict("Assignment unavailable");
   const access=await assignmentSubmissionAccess(tx,user,courseId,assignment.programId,{teacherOnly:true});if(!access.teacher)throw new ReviewConflict("Forbidden");
   // Serialize feedback with changes to the answer it refers to.
   await tx.$queryRaw`SELECT "id" FROM "CourseAssignmentSubmission" WHERE "id" = ${submissionId} AND "assignmentId" = ${assignmentId} FOR UPDATE`;
   const submission=await tx.courseAssignmentSubmission.findFirst({where:{id:submissionId,assignmentId},select:{id:true,version:true}});if(!submission)throw new ReviewConflict("Submission unavailable");
   const receipt=await tx.courseAssignmentReviewReceipt.findUnique({where:{submissionId_reviewerId_requestId:{submissionId,reviewerId:user.userId,requestId}}});
   if(receipt){if(receipt.submissionVersion!==input.submissionVersion||receipt.expectedVersion!==input.expectedVersion||receipt.result!==input.result||receipt.feedback!==input.feedback)throw new ReviewConflict("Request already used");const current=await tx.courseAssignmentReview.findUnique({where:{submissionId},select});if(!current)throw new ReviewConflict("Review unavailable");return current;}
   if(submission.version!==input.submissionVersion)throw new ReviewConflict("Submission changed");
   let saved;
   const data={submissionVersion:input.submissionVersion,reviewerId:user.userId,reviewerName:user.displayName||user.name||user.userId,result:input.result,feedback:input.feedback};
   if(input.expectedVersion===null){if(await tx.courseAssignmentReview.findUnique({where:{submissionId},select:{id:true}}))throw new ReviewConflict("Review changed");saved=await tx.courseAssignmentReview.create({data:{submissionId,...data},select});}
   else{const updated=await tx.courseAssignmentReview.updateMany({where:{submissionId,version:input.expectedVersion},data:{...data,version:{increment:1}}});if(!updated.count)throw new ReviewConflict("Review changed");saved=await tx.courseAssignmentReview.findUniqueOrThrow({where:{submissionId},select});}
   await tx.courseAssignmentReviewReceipt.create({data:{submissionId,reviewerId:user.userId,requestId,...input}});
   return saved;
  },{isolationLevel:"Serializable"});
  return NextResponse.json({review},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof ReviewConflict)return NextResponse.json({error:error.message},{status:error.message==="Forbidden"?403:error.message==="Assignment unavailable"||error.message==="Submission unavailable"?404:409});
  if(typeof error==="object"&&error&&"code" in error&&(error.code==="P2034"||error.code==="P2002"))return NextResponse.json({error:"Review is being updated; retry safely"},{status:503});
  console.error(`[assignment:review] ${error instanceof Error?error.name:"unknown"}`);return NextResponse.json({error:"Unable to save review"},{status:503});
 }
}
