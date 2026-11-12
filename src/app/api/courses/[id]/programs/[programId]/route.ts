import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {assertCanTeachCourse} from "@/lib/course-teacher";

type Context={params:Promise<{id:string;programId:string}>};
export async function PATCH(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,programId}=await params;
 let name:string,previousName:string;
 try{const body=await request.json();name=typeof body?.name==="string"?body.name.trim():"";previousName=typeof body?.previousName==="string"?body.previousName:"";if(!name||name.length>40||["主课程","main course"].includes(name.toLocaleLowerCase())||!previousName||previousName.length>40)throw new Error();}
 catch{return NextResponse.json({error:"Invalid course name"},{status:400});}
 try{
  if(user.role!=="teacher"||!await assertCanTeachCourse(user.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const updated=await prisma.courseProgram.updateMany({where:{id:programId,courseId,name:previousName},data:{name}});
  if(!updated.count)return NextResponse.json({error:"Course changed; refresh and retry"},{status:409});
  return NextResponse.json({program:{id:programId,name}});
 }catch(error){if(typeof error==="object"&&error!==null&&"code" in error&&error.code==="P2002")return NextResponse.json({error:"Course name already exists"},{status:409});return NextResponse.json({error:"Unable to update course"},{status:503});}
}
