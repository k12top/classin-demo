import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {taskInput} from "@/lib/workspace-task-validation";
import {resolveCoursewareAccess} from "@/lib/courseware-access";

type Context={params:Promise<{id:string}>};
export async function DELETE(request:NextRequest,{params}:Context){
  const session=await getSessionFromRequest(request);
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  let version:number;
  try{const body=await request.json();if(!Number.isSafeInteger(body?.version)||body.version<0)throw new Error();version=body.version;}
  catch{return NextResponse.json({error:"Invalid task version"},{status:400});}
  try{
    const deleted=await prisma.workspaceTask.deleteMany({where:{id,userId:session.userId,version}});
    if(!deleted.count){const exists=await prisma.workspaceTask.findFirst({where:{id,userId:session.userId},select:{id:true}});return NextResponse.json({error:exists?"Task changed; refresh and retry":"Task not found"},{status:exists?409:404});}
    return NextResponse.json({deleted:true});
  }catch{return NextResponse.json({error:"Unable to delete task"},{status:503});}
}
export async function PATCH(request:NextRequest,{params}:Context){
  const session=await getSessionFromRequest(request);
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  let value:Record<string,unknown>;
  try{value=await request.json();if(!value || typeof value!=="object" || !Number.isSafeInteger(value.version) || (value.version as number)<0)throw new Error("Invalid version");}
  catch{return NextResponse.json({error:"Invalid task update"},{status:400});}
  let data:{title?:string;notes?:string;dueDate?:string|null;courseId?:string|null;sessionId?:string|null;completed?:boolean};
  try{
    if(typeof value.completed==="boolean")data={completed:value.completed};
    else {data=taskInput(value);if(!Object.hasOwn(value,"courseId"))delete data.courseId;if(!Object.hasOwn(value,"sessionId"))delete data.sessionId;}
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid task"},{status:400});}
  try{
    if(typeof value.completed!=="boolean"){
      const current=await prisma.workspaceTask.findFirst({where:{id,userId:session.userId},select:{courseId:true,sessionId:true}});
      if(!current)return NextResponse.json({error:"Task not found"},{status:404});
      const courseId=data.courseId===undefined?current.courseId:data.courseId;
      const sessionId=data.sessionId===undefined?(courseId===current.courseId?current.sessionId:null):data.sessionId;
      if(sessionId && (!courseId || !await prisma.courseSession.findFirst({where:{id:sessionId,courseId},select:{id:true}})))return NextResponse.json({error:"Lesson unavailable"},{status:403});
      if(courseId && !(await resolveCoursewareAccess(session,courseId,sessionId)).allowed)return NextResponse.json({error:"Course unavailable"},{status:403});
      if(data.sessionId===undefined && sessionId!==current.sessionId)data.sessionId=sessionId;
    }
    const changed=await prisma.workspaceTask.updateMany({where:{id,userId:session.userId,version:value.version as number},data:{...data,version:{increment:1}}});
    if(!changed.count){const exists=await prisma.workspaceTask.findFirst({where:{id,userId:session.userId},select:{id:true}});return NextResponse.json({error:exists?"Task changed; refresh and retry":"Task not found"},{status:exists?409:404});}
    return NextResponse.json({task:await prisma.workspaceTask.findFirst({where:{id,userId:session.userId}})});
  }catch{return NextResponse.json({error:"Unable to update task"},{status:503});}
}
