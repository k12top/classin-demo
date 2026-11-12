import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assignmentSubmissionAccess} from "@/lib/course-assignment-submissions";
import {prisma} from "@/lib/db";

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string;assignmentId:string}>}){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,assignmentId}=await params;
 try{const assignment=await prisma.coursePublishedAssignment.findFirst({where:{id:assignmentId,courseId},select:{id:true,programId:true,unitId:true,title:true,description:true,dueDate:true}});if(!assignment)return NextResponse.json({error:"Assignment unavailable"},{status:404});
  const access=await assignmentSubmissionAccess(prisma,user,courseId,assignment.programId);if(!access.teacher&&!access.student)return NextResponse.json({error:"Forbidden"},{status:403});
  return NextResponse.json({assignment},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load assignment"},{status:503});}
}
