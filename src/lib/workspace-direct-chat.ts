import {prisma} from "@/lib/db";
import {canAccessCourseware} from "@/lib/courseware-access";
import {casdoorUserIdsMatch} from "@/lib/casdoor-user";
import type {SessionPayload} from "@/lib/session";

type Identity=Pick<SessionPayload,"userId"|"name">;
export function directPrincipal(value:string){return value.trim().split("/").at(-1)||"";}
export function directIsSelf(session:Identity,id:string){return [session.userId,session.name].some(value=>casdoorUserIdsMatch(value||"",id));}

/** Only expose long-term course members, after checking the caller's course access. */
export async function directContacts(session:Identity,courseId:string){
 if(!await canAccessCourseware(session,courseId))return null;
 const course=await prisma.course.findUnique({where:{id:courseId},select:{ownerId:true,ownerName:true,teacherId:true,teacherName:true,teachers:{select:{teacherId:true,teacherName:true}},students:{select:{studentId:true,studentName:true}},groupLinks:{select:{group:{select:{members:{select:{userId:true,userName:true}}}}}}}});
 if(!course)return null;
 const users=[{id:course.ownerId,name:course.ownerName},{id:course.teacherId,name:course.teacherName},...course.teachers.map(member=>({id:member.teacherId,name:member.teacherName})),...course.students.map(member=>({id:member.studentId,name:member.studentName})),...course.groupLinks.flatMap(link=>link.group.members.map(member=>({id:member.userId,name:member.userName})))];
 const unique=new Map<string,{id:string;name:string}>();
 for(const member of users){const id=directPrincipal(member.id);if(id&&!directIsSelf(session,id)&&!unique.has(id))unique.set(id,{id,name:member.name||id});}
 return [...unique.values()];
}

/** Do not trust a conversation id without checking both the member and class. */
export async function authorizedDirectChat(session:Identity,id:string){
 const chat=await prisma.workspaceDirectChat.findUnique({where:{id}});
 if(!chat||(!directIsSelf(session,chat.participantA)&&!directIsSelf(session,chat.participantB)))return null;
 if(!await canAccessCourseware(session,chat.courseId))return null;
 return chat;
}
