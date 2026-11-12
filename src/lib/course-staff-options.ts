type StaffPerson = {id:string; name:string};
type StaffRoster = {teachers:StaffPerson[]; observers:StaffPerson[]};

/** Include explicit lesson roles as well as inherited course teachers. */
export function removableCourseStaff(base:StaffPerson[], rosters:StaffRoster[]):StaffPerson[] {
 const people=new Map<string,StaffPerson>();
 for(const person of [...base,...rosters.flatMap(roster=>[...roster.teachers,...roster.observers])]){
  if(person.id&&!people.has(person.id))people.set(person.id,person);
 }
 return [...people.values()];
}
