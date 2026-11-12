import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {assertCanTeachCourse} from "@/lib/course-teacher";

type Context={params:Promise<{id:string;sessionId:string}>};
export async function PATCH(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,sessionId}=await params;
 let programId:string|null,previousProgramId:string|null;
 try{const body=await request.json();if(!Object.hasOwn(body,"programId")||!Object.hasOwn(body,"previousProgramId")||![body.programId,body.previousProgramId].every(value=>value===null||(typeof value==="string"&&value.length>0&&value.length<=100)))throw new Error();programId=body.programId;previousProgramId=body.previousProgramId;}
 catch{return NextResponse.json({error:"Invalid course assignment"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  if(programId&&!await prisma.courseProgram.findFirst({where:{id:programId,courseId},select:{id:true}}))return NextResponse.json({error:"Course unavailable"},{status:404});
  const changed=await prisma.courseSession.updateMany({where:{id:sessionId,courseId,programId:previousProgramId},data:{programId,...(programId!==previousProgramId?{unitId:null}:{})}});
  if(!changed.count)return NextResponse.json({error:"Lesson changed; refresh and retry"},{status:409});
  return NextResponse.json({sessionId,programId});
 }catch{return NextResponse.json({error:"Unable to update lesson"},{status:503});}
}
