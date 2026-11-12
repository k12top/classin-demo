import "server-only";
import type {Prisma} from "@prisma/client";
import {casdoorUserIdCandidates,userCanTeachCourse} from "@/lib/course-teacher";
import {getEffectiveSessionRosters,getEffectiveSessionRostersSequential,rosterContainsUser,rosterHasObserver} from "@/lib/course-session-roster";
import type {SessionPayload} from "@/lib/session";

/** Apply the same effective roster as the classroom; observer is read-only. */
export async function assignmentSubmissionAccess(tx:Prisma.TransactionClient,user:SessionPayload,courseId:string,programId:string|null,options:{sequential?:boolean;teacherOnly?:boolean}={}){
 const course=await tx.course.findUnique({where:{id:courseId},include:{teachers:true}});
 if(!course)return {teacher:false,student:false};
 const aliases=[...new Set([user.userId,user.name||""].flatMap(casdoorUserIdCandidates))];
 const teacher=user.role==="teacher"&&userCanTeachCourse(course,aliases);
 if(teacher)return {teacher:true,student:false};
 if(options.teacherOnly)return {teacher:false,student:false};
 const lessons=await tx.courseSession.findMany({where:{courseId,programId},select:{id:true},orderBy:{id:"asc"}});
 for(let offset=0;offset<lessons.length;offset+=100){
  const ids=lessons.slice(offset,offset+100).map(lesson=>lesson.id);
  const rosters=options.sequential?await getEffectiveSessionRostersSequential(ids,tx):await getEffectiveSessionRosters(ids,tx);
  if(rosters.some(roster=>!rosterHasObserver(roster,aliases)&&rosterContainsUser(roster,aliases)?.kind==="student"))return {teacher:false,student:true};
 }
 return {teacher:false,student:false};
}
export function assignmentSubmissionInput(body:unknown){
 if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("Invalid submission");
 const input=body as Record<string,unknown>;
 if(typeof input.content!=="string"||!input.content.trim()||input.content.length>10000)throw new Error("Invalid response");
 if(input.expectedVersion!==null&&(!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<0))throw new Error("Invalid version");
 return {content:input.content.trim(),expectedVersion:input.expectedVersion as number|null};
}
