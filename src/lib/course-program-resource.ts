import "server-only";
import {createHash} from "node:crypto";
import {prisma} from "@/lib/db";
import {assertCanTeachCourse} from "@/lib/course-teacher";
import {getCoursewareLessons} from "@/lib/courseware-access";
import type {SessionPayload} from "@/lib/session";

/** Class-wide teachers can manage resources; others need an assigned lesson
 * in this exact program. Never infer access from a program ID supplied by a client. */
export async function resourceAccess(user:SessionPayload,courseId:string,programId:string|null){
 if(user.role==="teacher"&&await assertCanTeachCourse(user.userId,courseId))return {allowed:true,canManage:true};
 const lessons=await getCoursewareLessons(user,courseId);
 if(!lessons.length)return {allowed:false,canManage:false};
 const count=await prisma.courseSession.count({where:{courseId,programId,id:{in:lessons.map(lesson=>lesson.id)}}});
 return {allowed:count>0,canManage:false};
}
export function programResourceKey(courseId:string,userId:string,requestId:string){
 const digest=createHash("sha256").update(JSON.stringify([courseId,userId,requestId])).digest("hex");
 return `workspace-course-resources/${digest.slice(0,2)}/${digest}`;
}
export const resourceSelect={id:true,programId:true,unitId:true,name:true,size:true,status:true,createdAt:true} as const;
