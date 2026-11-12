import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {assertCanTeachCourse} from "@/lib/course-teacher";
import {assignmentProgramId} from "@/lib/course-assignment-draft";
import {prisma} from "@/lib/db";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const {id:courseId}=await params;
 let programId:string|null,ids:string[],unitId:string,direction:"up"|"down";
 try{const body=await request.json();programId=assignmentProgramId(body.programId);ids=body.ids;unitId=body.unitId;direction=body.direction;if(!Array.isArray(ids)||ids.length<2||ids.length>500||ids.some(id=>typeof id!=="string"||!id||id.length>100)||new Set(ids).size!==ids.length||!ids.includes(unitId)||!(direction==="up"||direction==="down"))throw new Error();}catch{return NextResponse.json({error:"Invalid unit order"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const result=await prisma.$transaction(async tx=>{
   const existing=await tx.courseProgramUnit.findMany({where:{courseId,programId},select:{id:true},orderBy:[{sortOrder:"asc"},{createdAt:"asc"},{id:"asc"}]});
   if(existing.length!==ids.length||existing.some((item,index)=>item.id!==ids[index]))return false;
   const index=ids.indexOf(unitId),next=index+(direction==="up"?-1:1);if(next<0||next>=ids.length)return false;
   const ordered=[...ids];[ordered[index],ordered[next]]=[ordered[next],ordered[index]];
   for(let i=0;i<ordered.length;i++)await tx.courseProgramUnit.updateMany({where:{id:ordered[i],courseId,programId},data:{sortOrder:i-ordered.length,version:{increment:1}}});
   return true;
  },{isolationLevel:"Serializable"});
  if(!result)return NextResponse.json({error:"Unit order changed; refresh and retry"},{status:409});
  return NextResponse.json({updated:true});
 }catch{return NextResponse.json({error:"Unable to reorder units; refresh and retry"},{status:503});}
}
