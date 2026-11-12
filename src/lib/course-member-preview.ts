export type CoursePreviewMember={id:string;name:string;avatar?:string};
type Roster={students:readonly {studentId:string;studentName:string;studentAvatar?:string}[];groupLinks?:readonly {group:{members:readonly {userId:string;userName?:string;userAvatar?:string}[]}}[]};
/** Use the authorized course roster, including linked groups; match directory ID aliases. */
export function coursePreviewMembers(course:Roster):CoursePreviewMember[]{
 const members=new Map<string,CoursePreviewMember>();
 const add=(id:string,name?:string,avatar?:string)=>{
  const key=id.split('/').at(-1)?.trim();if(!key)return;
  const existing=members.get(key);
  if(!existing)members.set(key,{id,name:name?.trim()||key,avatar:avatar||undefined});
  else{if(existing.name===key&&name?.trim())existing.name=name.trim();if(!existing.avatar&&avatar)existing.avatar=avatar;}
 };
 for(const student of course.students)add(student.studentId,student.studentName,student.studentAvatar);
 for(const link of course.groupLinks||[])for(const member of link.group.members)add(member.userId,member.userName,member.userAvatar);
 return [...members.values()];
}
