import {courseListLessonRoles} from "@/lib/course-list-visibility";
import {getEffectiveSessionRosters,rosterContainsUser,rosterHasObserver} from "@/lib/course-session-roster";

/** Use the same effective-roster rules for list, detail and courseware access. */
export async function getViewerSessionRoles(sessionIds:readonly string[],aliases:readonly string[]){
 return courseListLessonRoles(sessionIds,async ids=>{
  const rosters=await getEffectiveSessionRosters(ids);
  return rosters.flatMap<{id:string;role:"teacher"|"assistant"|"student"|"observer"}>(roster=>{
   if(rosterHasObserver(roster,aliases))return [{id:roster.sessionId,role:"observer" as const}];
   const member=rosterContainsUser(roster,aliases);
   return member?[{id:roster.sessionId,role:member.kind==="teacher"?member.member.role:"student" as const}]:[];
  });
 });
}
