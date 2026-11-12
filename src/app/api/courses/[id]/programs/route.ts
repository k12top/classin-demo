import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {resolveCoursewareAccess} from "@/lib/courseware-access";
import {assertCanTeachCourse} from "@/lib/course-teacher";
import {taskRequestId} from "@/lib/workspace-task-validation";

type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;
 try{
  const access=await resolveCoursewareAccess(user,courseId);if(!access.allowed)return NextResponse.json({error:"Forbidden"},{status:403});
  const allowed=access.scope==="session"?(access.lessons||[]).map(lesson=>lesson.id):null;
  const programs=await prisma.courseProgram.findMany({where:{courseId,...(allowed?{sessions:{some:{id:{in:allowed}}}}:{})},select:{id:true,name:true},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  return NextResponse.json({programs},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load courses"},{status:503});}
}
export async function POST(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;
 let name:string,requestId:string;
 try{const body=await request.json();name=typeof body?.name==="string"?body.name.trim():"";requestId=taskRequestId(request.headers.get("Idempotency-Key"));if(!name||name.length>40||["主课程","main course"].includes(name.toLocaleLowerCase()))throw new Error("Invalid course name");}
 catch{return NextResponse.json({error:"Invalid course name or request id"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const program=await prisma.courseProgram.upsert({where:{courseId_requestId:{courseId,requestId}},create:{courseId,name,requestId},update:{},select:{id:true,name:true}});
  if(program.name!==name)return NextResponse.json({error:"Request already used"},{status:409});
  return NextResponse.json({program},{status:201});
 }catch(error){if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="P2002")return NextResponse.json({error:"Course name already exists"},{status:409});return NextResponse.json({error:"Unable to create course"},{status:503});}
}
