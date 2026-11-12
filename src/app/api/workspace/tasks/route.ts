import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {prisma} from "@/lib/db";
import {taskInput,taskRequestId} from "@/lib/workspace-task-validation";
import {resolveCoursewareAccess} from "@/lib/courseware-access";

export async function GET(request:NextRequest){
  const session=await getSessionFromRequest(request);
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  try {
    const cursor=request.nextUrl.searchParams.get("cursor");
    if(cursor && !await prisma.workspaceTask.findFirst({where:{id:cursor,userId:session.userId},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
    const rows=await prisma.workspaceTask.findMany({where:{userId:session.userId},orderBy:[{createdAt:"desc"},{id:"desc"}],take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});
    const hasMore=rows.length>100,tasks=rows.slice(0,100);
    return NextResponse.json({tasks,nextCursor:hasMore?tasks[tasks.length-1].id:null},{headers:{"Cache-Control":"no-store"}});
  }catch{ return NextResponse.json({error:"Unable to load tasks"},{status:503}); }
}
export async function POST(request:NextRequest){
  const session=await getSessionFromRequest(request);
  if(!session)return NextResponse.json({error:"Unauthorized"},{status:401});
  let input,requestId:string;
  try{input=taskInput(await request.json());requestId=taskRequestId(request.headers.get("Idempotency-Key"));}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Invalid task"},{status:400});}
  try {
    if(input.sessionId && !await prisma.courseSession.findFirst({where:{id:input.sessionId,courseId:input.courseId!},select:{id:true}}))return NextResponse.json({error:"Lesson unavailable"},{status:403});
    if(input.courseId && !(await resolveCoursewareAccess(session,input.courseId,input.sessionId)).allowed)return NextResponse.json({error:"Course unavailable"},{status:403});
    const task=await prisma.workspaceTask.upsert({where:{userId_requestId:{userId:session.userId,requestId}},create:{...input,userId:session.userId,requestId},update:{}});
    if(task.title!==input.title || task.notes!==input.notes || task.dueDate!==input.dueDate || task.courseId!==input.courseId || task.sessionId!==input.sessionId)return NextResponse.json({error:"Request id already used for a different task"},{status:409});
    return NextResponse.json({task},{status:201});
  }catch{return NextResponse.json({error:"Unable to save task"},{status:503});}
}
