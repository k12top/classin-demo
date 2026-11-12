import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assertCanTeachCourse} from "@/lib/course-teacher";
import {assignmentProgramId} from "@/lib/course-assignment-draft";
import {prisma} from "@/lib/db";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const {id:courseId}=await params;
 let programId:string|null,unitId:string|null,previousUnitId:string|null,itemId:string,kind:string;
 try{const body=await request.json();if(!Object.hasOwn(body,"unitId")||!Object.hasOwn(body,"previousUnitId")||typeof body.itemId!=="string"||!body.itemId||body.itemId.length>100||!["lesson","resource","draft"].includes(body.kind))throw new Error();programId=assignmentProgramId(body.programId);unitId=assignmentProgramId(body.unitId);previousUnitId=assignmentProgramId(body.previousUnitId);itemId=body.itemId;kind=body.kind;}catch{return NextResponse.json({error:"Invalid placement"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  if(unitId&&!await prisma.courseProgramUnit.findFirst({where:{id:unitId,courseId,programId},select:{id:true}}))return NextResponse.json({error:"Unit unavailable"},{status:404});
  const where={id:itemId,courseId,programId,unitId:previousUnitId};
  const changed=kind==="lesson"?await prisma.courseSession.updateMany({where,data:{unitId}}):kind==="resource"?await prisma.courseProgramResource.updateMany({where:{...where,status:"ready"},data:{unitId}}):await prisma.courseAssignmentDraft.updateMany({where,data:{unitId,version:{increment:1}}});
  if(!changed.count)return NextResponse.json({error:"Item changed or unavailable"},{status:409});return NextResponse.json({itemId,unitId});
 }catch{return NextResponse.json({error:"Unable to move item"},{status:503});}
}
