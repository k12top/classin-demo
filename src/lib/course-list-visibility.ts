/** Resolve each unique lesson in bounded batches; failures fail the list closed. */
export async function courseListLessonRoles(ids:readonly string[],lookup:(ids:string[])=>Promise<Array<{id:string;role:"teacher"|"assistant"|"student"|"observer"}>>,batchSize=100){
 const roles=new Map<string,"teacher"|"assistant"|"student"|"observer">(),unique=[...new Set(ids)];
 for(let offset=0;offset<unique.length;offset+=batchSize){const batch=unique.slice(offset,offset+batchSize),allowed=new Set(batch);for(const item of await lookup(batch))if(allowed.has(item.id))roles.set(item.id,item.role);}
 return roles;
}
/** Hide scheduling and legacy recording fields if the viewer has no authorized lesson. */
type ListCourse = {sessions:{id:string}[];recordUrl?:string|null;roomUuid?:string|null;startTime?:Date|null;endTime?:Date|null};
type ScopedCourse<T extends ListCourse> = Omit<T,"sessions"|"recordUrl"|"roomUuid"|"startTime"|"endTime"> & {sessions:T["sessions"];recordUrl:T["recordUrl"]|null;roomUuid:T["roomUuid"]|null;startTime:T["startTime"]|null;endTime:T["endTime"]|null};
export function scopeListedCourse<T extends ListCourse>(course:T,roles:ReadonlyMap<string,unknown>):ScopedCourse<T>{
 const sessions=course.sessions.filter(item=>roles.has(item.id));
 return {...course,sessions,...(course.sessions.length?{recordUrl:null,...(!sessions.length?{roomUuid:null,startTime:null,endTime:null}:{})}:{})} as ScopedCourse<T>;
}
