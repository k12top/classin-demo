import {createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/db";
import {getSessionFromRequest} from "@/lib/session";
import {assertCanTeachCourse,userCanTeachCourse} from "@/lib/course-teacher";
import {casdoorUserIdsMatch} from "@/lib/casdoor-user";
import {listDirectoryUsers} from "@/lib/user-directory";
import {getEffectiveSessionRosters} from "@/lib/course-session-roster";
import {taskRequestId} from "@/lib/workspace-task-validation";
import {STAFF_ASSIGNMENT_LIMIT} from "@/lib/course-staff-pending";

export const runtime="nodejs";
class Conflict extends Error {}
type Target={id:string;updatedAt:string};
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await getSessionFromRequest(request);if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params,ids=request.nextUrl.searchParams.getAll("id");
 if(!ids.length||ids.length>100||ids.some(id=>!id||id.length>100)||new Set(ids).size!==ids.length)return NextResponse.json({error:"Invalid lessons"},{status:400});
 try{
  if(auth.role!=="teacher"||!await assertCanTeachCourse(auth.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const lessons=await prisma.courseSession.findMany({where:{courseId,id:{in:ids}},select:{id:true}});
  if(lessons.length!==ids.length)return NextResponse.json({error:"Lesson unavailable"},{status:404});
  const rosters=await getEffectiveSessionRosters(ids);
  if(rosters.length!==ids.length||rosters.some(roster=>roster.courseId!==courseId))return NextResponse.json({error:"Lesson unavailable"},{status:404});
  return NextResponse.json({lessons:rosters.map(roster=>({id:roster.sessionId,leadTeacherId:roster.leadTeacherId,teachers:roster.teachers.map(teacher=>({id:teacher.userId,name:teacher.displayName,role:teacher.role})),observers:(roster.observers||[]).map(observer=>({id:observer.userId,name:observer.displayName}))}))},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Unable to load staff"},{status:503});}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=await getSessionFromRequest(request);if(!auth)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {id:courseId}=await params;let staffId:string,role:"teacher"|"assistant"|"observer"|"remove",targets:Target[],requestId:string;
 try{
  const body=await request.json();staffId=typeof body?.staffId==="string"?body.staffId.trim():"";role=body?.role;targets=body?.targets;requestId=taskRequestId(request.headers.get("Idempotency-Key"));
  if(!staffId||staffId.length>200||!["teacher","assistant","observer","remove"].includes(role)||!Array.isArray(targets)||!targets.length||targets.length>STAFF_ASSIGNMENT_LIMIT||targets.some(item=>!item||typeof item.id!=="string"||!item.id||item.id.length>100||typeof item.updatedAt!=="string"||!Number.isFinite(Date.parse(item.updatedAt))||new Date(item.updatedAt).toISOString()!==item.updatedAt)||new Set(targets.map(item=>item.id)).size!==targets.length)throw new Error();
 }catch{return NextResponse.json({error:"Invalid staff assignment"},{status:400});}
 const hash=createHash("sha256").update(JSON.stringify([courseId,staffId,role,[...targets].sort((a,b)=>a.id.localeCompare(b.id))])).digest("hex");
 try{
  if(auth.role!=="teacher"||!await assertCanTeachCourse(auth.userId,courseId))return NextResponse.json({error:"Forbidden"},{status:403});
  const previous=await prisma.courseStaffGrantReceipt.findUnique({where:{actorId_requestId:{actorId:auth.userId,requestId}}});
  if(previous)return previous.courseId===courseId&&previous.payloadHash===hash?NextResponse.json({updated:true,changes:previous.changes}):NextResponse.json({error:"Request id already used"},{status:409});
  // Revocation must still work when the account has left the directory.
  const existing=role==="remove"?await prisma.courseSessionTeacher.findFirst({where:{courseId,sessionId:{in:targets.map(item=>item.id)},teacherId:staffId}}):null;
  const courseTeacher=role==="remove"&&!existing?await prisma.courseTeacher.findFirst({where:{courseId,teacherId:staffId}}):null;
  const stored=existing||courseTeacher;
  const self=staffId===auth.userId?{id:auth.userId,name:auth.name||auth.userId,displayName:auth.displayName||auth.name||auth.userId,avatar:"",casdoorUuid:auth.name||null}:null;
  let matches:Awaited<ReturnType<typeof listDirectoryUsers>>=[];
  if(!self){try{matches=await listDirectoryUsers({query:staffId,role:"teacher",limit:100});}catch(error){if(!stored)throw error;}}
  const directoryStaff=matches.find(item=>item.id===staffId||item.casdoorUuid===staffId);
  const staff=self||directoryStaff||(stored?{id:stored.teacherId,name:stored.teacherName,displayName:stored.teacherName,avatar:stored.teacherAvatar,casdoorUuid:null}:null);
  if(!staff)return NextResponse.json({error:"Teacher unavailable"},{status:404});
  const aliases=[staffId,staff.id,staff.casdoorUuid||""].filter(Boolean),matchesStaff=(id:string)=>aliases.some(alias=>casdoorUserIdsMatch(alias.trim().toLowerCase(),id.trim().toLowerCase()));
  const changes=await prisma.$transaction(async tx=>{
   const course=await tx.course.findUnique({where:{id:courseId},include:{teachers:true}});
   if(!course||!userCanTeachCourse(course,auth.userId))throw new Conflict("Permission changed");
   const lessons=await tx.courseSession.findMany({where:{courseId,id:{in:targets.map(item=>item.id)}},include:{teachers:true}});
   if(lessons.length!==targets.length)throw new Conflict("Lesson unavailable");
   const rosters=await getEffectiveSessionRosters(lessons.map(item=>item.id),tx),rosterMap=new Map(rosters.map(item=>[item.sessionId,item]));
   const events=[];
   for(const target of [...targets].sort((a,b)=>a.id.localeCompare(b.id))){
    const lesson=lessons.find(item=>item.id===target.id)!,roster=rosterMap.get(target.id);
    if(lesson.status!=="scheduled"||lesson.endedAt||lesson.updatedAt.toISOString()!==target.updatedAt||!roster?.leadTeacherId)throw new Conflict("Lesson changed");
    if(role!=="teacher"&&matchesStaff(roster.leadTeacherId))throw new Conflict("Cannot remove or demote the lesson lead");
    const before=roster.teachers.find(item=>matchesStaff(item.userId))?.role||(roster.observers?.some(item=>matchesStaff(item.userId))?"observer":null);
    const updated=await tx.courseSession.updateMany({where:{id:lesson.id,courseId,status:"scheduled",endedAt:null,updatedAt:lesson.updatedAt},data:{...(role==="teacher"?{leadTeacherId:staff.id,leadTeacherName:staff.displayName||staff.name||staff.id,leadTeacherAvatar:staff.avatar||""}:{}),updatedAt:new Date(Math.max(Date.now(),lesson.updatedAt.getTime()+1))}});
    if(!updated.count)throw new Conflict("Lesson changed");
    if(role==="observer"){
     // Issued RTC/whiteboard credentials cannot be revoked by changing the
     // roster. Never downgrade someone who already joined under a role that
     // could have received write credentials for this lesson.
     const members=await tx.classroomMemberState.findMany({where:{sessionId:lesson.id,role:{not:"observer"}},select:{userId:true}});
     if(members.some(member=>matchesStaff(member.userId)))throw new Conflict("Observer previously joined this lesson");
    }
    const oldRules=lesson.teachers.filter(item=>matchesStaff(item.teacherId));
    if(oldRules.length)await tx.courseSessionTeacher.deleteMany({where:{sessionId:lesson.id,id:{in:oldRules.map(item=>item.id)}}});
    await tx.courseSessionTeacher.create({data:{courseId,sessionId:lesson.id,teacherId:staff.id,teacherName:staff.displayName||staff.name||staff.id,teacherAvatar:staff.avatar||"",action:role==="remove"?"exclude":"include",role:role==="remove"?"assistant":role}});
    events.push({sessionId:lesson.id,staffId:staff.id,action:role,before,previousLeadId:roster.leadTeacherId});
   }
   await tx.courseStaffGrantReceipt.create({data:{actorId:auth.userId,requestId,courseId,payloadHash:hash,changes:events}});
   return events;
  },{isolationLevel:"Serializable"});
  return NextResponse.json({updated:true,changes});
 }catch(error){
  if(error instanceof Conflict)return NextResponse.json({error:error.message},{status:409});
  if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002"){
   const previous=await prisma.courseStaffGrantReceipt.findUnique({where:{actorId_requestId:{actorId:auth.userId,requestId}}});
   if(previous&&previous.courseId===courseId&&previous.payloadHash===hash)return NextResponse.json({updated:true,changes:previous.changes});
  }
  if(typeof error==="object"&&error&&"code" in error&&error.code==="P2034")return NextResponse.json({error:"Assignments changed; refresh and retry"},{status:409});
  return NextResponse.json({error:"Unable to update staff"},{status:503});
 }
}
