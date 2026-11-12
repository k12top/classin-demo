import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {getCoursewareLessons} from "@/lib/courseware-access";
import {resourceAccess} from "@/lib/course-program-resource";
import {assignmentProgramId} from "@/lib/course-assignment-draft";
import {taskRequestId} from "@/lib/workspace-task-validation";
import {driveName} from "@/lib/workspace-drive";
import {prisma} from "@/lib/db";
type Context={params:Promise<{id:string}>};
const select={id:true,programId:true,name:true,version:true} as const;
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const {id:courseId}=await params;
 let programId:string|null;try{programId=assignmentProgramId(request.nextUrl.searchParams.get("programId"));}catch{return NextResponse.json({error:"Invalid course"},{status:400});}
 try{
  const access=await resourceAccess(user,courseId,programId);if(!access.allowed)return NextResponse.json({error:"Forbidden"},{status:403});
  const visible=access.canManage?undefined:(await getCoursewareLessons(user,courseId)).map(lesson=>lesson.id);
  const units=await prisma.courseProgramUnit.findMany({where:{courseId,programId,...(visible?{OR:[{sessions:{some:{id:{in:visible}}}},{resources:{some:{status:"ready"}}},{publishedAssignments:{some:{}}}]}:{})},select,orderBy:[{sortOrder:"asc"},{createdAt:"asc"},{id:"asc"}]});
  return NextResponse.json({units},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load units"},{status:503});}
}
export async function POST(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const {id:courseId}=await params;
 let programId:string|null,name:string,requestId:string;
 try{const body=await request.json();programId=assignmentProgramId(body.programId);name=driveName(body.name);if(name.length>80)throw new Error();requestId=taskRequestId(request.headers.get("Idempotency-Key"));}catch{return NextResponse.json({error:"Invalid unit"},{status:400});}
 try{
  if(!(await resourceAccess(user,courseId,programId)).canManage)return NextResponse.json({error:"Forbidden"},{status:403});
  if(programId&&!await prisma.courseProgram.findFirst({where:{id:programId,courseId},select:{id:true}}))return NextResponse.json({error:"Course unavailable"},{status:404});
  const unit=await prisma.courseProgramUnit.upsert({where:{courseId_creatorId_requestId:{courseId,creatorId:user.userId,requestId}},create:{courseId,programId,creatorId:user.userId,requestId,name},update:{},select});
  if(unit.name!==name||unit.programId!==programId)return NextResponse.json({error:"Request already used"},{status:409});
  return NextResponse.json({unit},{status:201});
 }catch{return NextResponse.json({error:"Unable to save unit"},{status:503});}
}
