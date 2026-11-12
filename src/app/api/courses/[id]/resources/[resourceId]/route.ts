import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {resourceAccess,resourceSelect} from "@/lib/course-program-resource";
import {driveName} from "@/lib/workspace-drive";
type Context={params:Promise<{id:string;resourceId:string}>};
const extension=(name:string)=>name.match(/(\.[a-z0-9]{1,10})$/i)?.[1].toLowerCase()||"";
export async function GET(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,resourceId}=await params;
 try{
  const resource=await prisma.courseProgramResource.findFirst({where:{id:resourceId,courseId,status:"ready"},select:resourceSelect});
  if(!resource||!(await resourceAccess(user,courseId,resource.programId)).canManage)return NextResponse.json({error:"Resource unavailable"},{status:404});
  return NextResponse.json({resource},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load resource"},{status:503});}
}
export async function PATCH(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,resourceId}=await params;let name:string,previousName:string;
 try{const body=await request.json();name=driveName(body.name);previousName=driveName(body.previousName);if(name.length>80||previousName.length>80||extension(name)!==extension(previousName))throw new Error();}catch{return NextResponse.json({error:"Invalid resource name or file extension"},{status:400});}
 try{
  const item=await prisma.courseProgramResource.findFirst({where:{id:resourceId,courseId,status:"ready"},select:{programId:true}});
  if(!item||!(await resourceAccess(user,courseId,item.programId)).canManage)return NextResponse.json({error:"Resource unavailable"},{status:404});
  const changed=await prisma.courseProgramResource.updateMany({where:{id:resourceId,courseId,programId:item.programId,status:"ready",name:previousName},data:{name}});
  if(!changed.count)return NextResponse.json({error:"Resource changed; refresh and retry"},{status:409});
  const resource=await prisma.courseProgramResource.findFirst({where:{id:resourceId,courseId,status:"ready"},select:resourceSelect});
  return NextResponse.json({resource});
 }catch{return NextResponse.json({error:"Unable to rename resource"},{status:503});}
}

export async function DELETE(request:NextRequest,{params}:Context){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId,resourceId}=await params;let previousName:string,programId:string|null,unitId:string|null;
 try{const body=await request.json();previousName=driveName(body.previousName);if(previousName.length>80||!(body.programId===null||typeof body.programId==="string")||!(body.unitId===null||typeof body.unitId==="string"))throw new Error();programId=body.programId;unitId=body.unitId;}catch{return NextResponse.json({error:"Invalid resource"},{status:400});}
 try{
  const item=await prisma.courseProgramResource.findFirst({where:{id:resourceId,courseId},select:{programId:true,unitId:true,name:true,status:true}});
  if(!item||!(await resourceAccess(user,courseId,item.programId)).canManage)return NextResponse.json({error:"Resource unavailable"},{status:404});
  if(item.name!==previousName||item.programId!==programId||item.unitId!==unitId)return NextResponse.json({error:"Resource changed; refresh and retry"},{status:409});
  if(item.status==="removed")return NextResponse.json({ok:true});
  const changed=await prisma.courseProgramResource.updateMany({where:{id:resourceId,courseId,programId,unitId,name:previousName,status:"ready"},data:{status:"removed"}});
  if(!changed.count){const current=await prisma.courseProgramResource.findFirst({where:{id:resourceId,courseId,programId,unitId,name:previousName,status:"removed"},select:{id:true}});if(!current)return NextResponse.json({error:"Resource changed; refresh and retry"},{status:409});}
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:"Unable to remove resource"},{status:503});}
}
