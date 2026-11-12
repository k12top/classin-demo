import type {CourseSessionItem} from '@/components/course-sessions/course-session-manager';
export type StaffRow={id:string;leadTeacherId:string|null;teachers:{id:string;name:string;role:'teacher'|'assistant'}[];observers:{id:string;name:string}[]};
export function editableStaffLesson(item:Pick<CourseSessionItem,'status'|'endedAt'|'updatedAt'>){return item.status==='scheduled'&&!item.endedAt&&Boolean(item.updatedAt);}
export function staffResponseRows(value:unknown,ids:readonly string[]):StaffRow[]{
 if(!value||typeof value!=='object'||!('lessons' in value)||!Array.isArray(value.lessons))throw Error('Invalid staff response');
 const rows=value.lessons,requested=new Set(ids),seen=new Set<string>();
 const person=(item:unknown):item is {id:string;name:string}=>Boolean(item&&typeof item==='object'&&'id' in item&&typeof item.id==='string'&&item.id&&'name' in item&&typeof item.name==='string');
 for(const row of rows){if(!row||typeof row.id!=='string'||!requested.has(row.id)||seen.has(row.id)||(row.leadTeacherId!==null&&typeof row.leadTeacherId!=='string')||!Array.isArray(row.teachers)||!row.teachers.every((teacher:unknown)=>person(teacher)&&'role' in teacher&&(teacher.role==='teacher'||teacher.role==='assistant'))||!Array.isArray(row.observers)||!row.observers.every(person))throw Error('Invalid staff response');seen.add(row.id);}
 if(seen.size!==requested.size)throw Error('Incomplete staff response');return rows as StaffRow[];
}
export function summarizeLessonStaff(rows:readonly StaffRow[],lessons:readonly CourseSessionItem[]){
 const people=new Map<string,{id:string;name:string;grants:{lessonId:string;title:string;role:'teacher'|'assistant'|'observer';editable:boolean}[]}>(),byId=new Map(lessons.map(item=>[item.id,item]));
 for(const row of rows){const lesson=byId.get(row.id);if(!lesson)continue;for(const person of [...row.teachers,...row.observers.map(observer=>({...observer,role:'observer' as const}))]){const key=person.id.split('/').at(-1)||person.id;let entry=people.get(key);if(!entry){entry={id:person.id,name:person.name||person.id,grants:[]};people.set(key,entry);}if(!entry.grants.some(grant=>grant.lessonId===row.id))entry.grants.push({lessonId:row.id,title:lesson.title,role:person.role,editable:editableStaffLesson(lesson)});}}
 return [...people.values()];
}

/** A success response must describe this exact batch before discarding recovery. */
export function validStaffAssignmentReceipt(value:unknown,body:string,aliases:readonly string[]=[]):boolean{
 try{
  const expected=JSON.parse(body);if(!Array.isArray(expected.targets)||!expected.targets.length||typeof expected.staffId!=='string'||!expected.staffId||!['teacher','assistant','observer','remove'].includes(expected.role))return false;
  if(!value||typeof value!=='object'||!('updated' in value)||value.updated!==true||!('changes' in value)||!Array.isArray(value.changes)||value.changes.length!==expected.targets.length)return false;
  const targets=new Set(expected.targets.map((item:{id:string})=>item.id)),seen=new Set<string>(),ids=[expected.staffId,...aliases].filter(id=>typeof id==='string'&&id).map(id=>id.split('/').at(-1));
  for(const change of value.changes){if(!change||typeof change.sessionId!=='string'||!targets.has(change.sessionId)||seen.has(change.sessionId)||change.action!==expected.role||typeof change.staffId!=='string'||!ids.includes(change.staffId.split('/').at(-1)))return false;seen.add(change.sessionId);}
  return seen.size===targets.size;
 }catch{return false;}
}
