import "server-only";
import type {Prisma} from "@prisma/client";
import {casdoorUserIdsMatch} from "@/lib/casdoor-user";
import {getEffectiveSessionRostersSequential,rosterContainsUser,rosterHasObserver} from "@/lib/course-session-roster";

/** Called after locking CourseSession so role changes and lifecycle writes serialize. */
export async function lifecycleRoleAfterLock(tx:Prisma.TransactionClient,sessionId:string,courseId:string,aliases:readonly string[]):Promise<"teacher"|"assistant"|null>{
 // An interactive transaction has one connection; do not queue concurrent
 // roster and course queries on it while holding the lesson lock.
 const [roster]=await getEffectiveSessionRostersSequential([sessionId],tx);
 const course=await tx.course.findUnique({where:{id:courseId},select:{ownerId:true,teacherId:true}});
 if(!roster||roster.courseId!==courseId||!course||rosterHasObserver(roster,aliases))return null;
 if(aliases.some(id=>casdoorUserIdsMatch(course.ownerId,id)||casdoorUserIdsMatch(course.teacherId,id)))return "teacher";
 const member=rosterContainsUser(roster,aliases);
 return member?.kind==="teacher"?member.member.role:null;
}
