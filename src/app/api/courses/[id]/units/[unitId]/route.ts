import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assertCanTeachCourse} from "@/lib/course-teacher";
import {driveName} from "@/lib/workspace-drive";
import {prisma} from "@/lib/db";
type Context={params:Promise<{id:string;unitId:string}>};
export async function PATCH(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const {id:courseId,unitId}=await params;
 let name:string,version:number;try{const body=await request.json();name=driveName(body.name);version=body.version;if(name.length>80||!Number.isSafeInteger(version)||version<0)throw new Error();}catch{return NextResponse.json({error:"Invalid unit"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const changed=await prisma.courseProgramUnit.updateMany({where:{id:unitId,courseId,version},data:{name,version:{increment:1}}});
  if(!changed.count)return NextResponse.json({error:"Unit changed or unavailable"},{status:409});
  const unit=await prisma.courseProgramUnit.findFirst({where:{id:unitId,courseId},select:{id:true,name:true,programId:true,version:true}});return NextResponse.json({unit});
 }catch{return NextResponse.json({error:"Unable to update unit"},{status:503});}
}

// Deleting a unit only removes the grouping. Its contents stay in the course.
export async function DELETE(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const {id:courseId,unitId}=await params;
 let version:number;try{const body=await request.json();version=body.version;if(!Number.isSafeInteger(version)||version<0)throw new Error();}catch{return NextResponse.json({error:"Invalid unit"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const removed=await prisma.$transaction(async tx=>{
   const unit=await tx.courseProgramUnit.findFirst({where:{id:unitId,courseId,version},select:{id:true,programId:true}});
   if(!unit)return false;
   const where={courseId,programId:unit.programId,unitId};
   await tx.courseSession.updateMany({where,data:{unitId:null}});
   await tx.courseProgramResource.updateMany({where,data:{unitId:null}});
   await tx.courseAssignmentDraft.updateMany({where,data:{unitId:null,version:{increment:1}}});
   await tx.coursePublishedAssignment.updateMany({where,data:{unitId:null}});
   const result=await tx.courseProgramUnit.deleteMany({where:{id:unitId,courseId,version}});
   if(!result.count)throw new Error("Unit changed");
   return true;
  },{isolationLevel:"Serializable"});
  if(!removed)return NextResponse.json({error:"Unit changed or unavailable"},{status:409});
  return NextResponse.json({removed:true});
 }catch{return NextResponse.json({error:"Unable to remove unit. Refresh and retry."},{status:503});}
}
