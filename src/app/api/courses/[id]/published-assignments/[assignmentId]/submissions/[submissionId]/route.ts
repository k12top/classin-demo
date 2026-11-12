import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assignmentSubmissionAccess} from "@/lib/course-assignment-submissions";
import {assignmentSubmissionSelect} from "@/lib/course-assignment-submission-select";
import {prisma} from "@/lib/db";

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string;assignmentId:string;submissionId:string}>}){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,assignmentId,submissionId}=await params;
 try{
  const assignment=await prisma.coursePublishedAssignment.findFirst({where:{id:assignmentId,courseId},select:{programId:true}});if(!assignment)return NextResponse.json({error:"Assignment unavailable"},{status:404});
  if(!(await assignmentSubmissionAccess(prisma,user,courseId,assignment.programId,{teacherOnly:true})).teacher)return NextResponse.json({error:"Forbidden"},{status:403});
  const submission=await prisma.courseAssignmentSubmission.findFirst({where:{id:submissionId,assignmentId},select:assignmentSubmissionSelect});
  if(!submission)return NextResponse.json({error:"Submission unavailable"},{status:404});
  return NextResponse.json({submission},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load submission"},{status:503});}
}
