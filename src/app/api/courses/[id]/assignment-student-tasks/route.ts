import {NextRequest,NextResponse} from "next/server";
import {getSessionFromRequest} from "@/lib/session";
import {casdoorUserIdCandidates,userCanTeachCourse} from "@/lib/course-teacher";
import {getViewerSessionRoles} from "@/lib/course-session-viewer";
import {prisma} from "@/lib/db";

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const user=await getSessionFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params,cursor=request.nextUrl.searchParams.get("cursor");
 try{
  const course=await prisma.course.findUnique({where:{id:courseId},include:{teachers:true}}),aliases=[...new Set([user.userId,user.name||""].flatMap(casdoorUserIdCandidates))];
  if(!course||(user.role==="teacher"&&userCanTeachCourse(course,aliases)))return NextResponse.json({tasks:[],nextCursor:null},{headers:{"Cache-Control":"private, no-store"}});
  const lessons=await prisma.courseSession.findMany({where:{courseId},select:{id:true,programId:true}}),roles=await getViewerSessionRoles(lessons.map(lesson=>lesson.id),aliases);
  const programs=[...new Set(lessons.filter(lesson=>roles.get(lesson.id)==="student").map(lesson=>lesson.programId))];
  if(!programs.length)return NextResponse.json({tasks:[],nextCursor:null},{headers:{"Cache-Control":"private, no-store"}});
  const ids=programs.filter((program):program is string=>program!==null),where={courseId,OR:[...(programs.includes(null)?[{programId:null}]:[]),...(ids.length?[{programId:{in:ids}}]:[])],submissions:{none:{studentId:user.userId}}};
  if(cursor&&!await prisma.coursePublishedAssignment.findFirst({where:{...where,id:cursor},select:{id:true}}))return NextResponse.json({error:"Invalid cursor"},{status:400});
  const rows=await prisma.coursePublishedAssignment.findMany({where,select:{id:true,programId:true,unitId:true,title:true,dueDate:true},orderBy:{id:"asc"},take:101,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const page=rows.slice(0,100);return NextResponse.json({tasks:page,nextCursor:rows.length>100?page.at(-1)!.id:null},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load assignments"},{status:503});}
}
