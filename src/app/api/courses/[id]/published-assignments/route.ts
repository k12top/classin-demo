import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {resourceAccess} from "@/lib/course-program-resource";
import {assignmentProgramId} from "@/lib/course-assignment-draft";
import {prisma} from "@/lib/db";

type Context={params:Promise<{id:string}>};
const select={id:true,programId:true,unitId:true,title:true,description:true,dueDate:true,publishedAt:true} as const;
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;let programId:string|null,unitId:string|null|undefined;
 try{programId=assignmentProgramId(request.nextUrl.searchParams.get("programId"));const raw=request.nextUrl.searchParams.get("unitId");unitId=raw===null?undefined:raw==="__default__"?null:assignmentProgramId(raw);}catch{return NextResponse.json({error:"Invalid scope"},{status:400});}
 try{
  if(!(await resourceAccess(user,courseId,programId)).allowed)return NextResponse.json({error:"Forbidden"},{status:403});
  const where={courseId,programId,...(unitId===undefined?{}:{unitId})},cursor=request.nextUrl.searchParams.get("cursor");
  if(cursor&&!await prisma.coursePublishedAssignment.findFirst({where:{...where,id:cursor},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.coursePublishedAssignment.findMany({where,select,orderBy:[{publishedAt:"desc"},{id:"desc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const assignments=rows.slice(0,100);return NextResponse.json({assignments,nextCursor:rows.length>100?assignments.at(-1)!.id:null},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load assignments"},{status:503});}
}
