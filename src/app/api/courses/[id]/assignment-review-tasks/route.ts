import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assertCanTeachCourse} from "@/lib/course-teacher";
import {prisma} from "@/lib/db";

type ReviewTask={id:string;programId:string|null;unitId:string|null;title:string;dueDate:string|null;pendingCount:number};
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const tasks=await prisma.$queryRaw<ReviewTask[]>`
   SELECT a."id",a."programId",a."unitId",a."title",a."dueDate",COUNT(*)::int AS "pendingCount"
   FROM "CoursePublishedAssignment" a
   JOIN "CourseAssignmentSubmission" s ON s."assignmentId"=a."id"
   LEFT JOIN "CourseAssignmentReview" r ON r."submissionId"=s."id"
   WHERE a."courseId"=${courseId} AND (r."id" IS NULL OR r."submissionVersion"<>s."version")
   GROUP BY a."id",a."programId",a."unitId",a."title",a."dueDate"
   ORDER BY a."id"`;
  return NextResponse.json({tasks},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load review tasks"},{status:503});}
}
