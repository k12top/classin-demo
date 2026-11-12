import {isExplicitInstant,validTimeZone} from "./time-zone";

export function eventInput(value:unknown){
  if(!value || typeof value!=="object" || Array.isArray(value))throw new Error("Invalid event");
  const input=value as Record<string,unknown>;
  if(typeof input.title!=="string" || !input.title.trim() || input.title.trim().length>200)throw new Error("Event title must contain 1–200 characters");
  if(input.notes!==undefined && (typeof input.notes!=="string" || input.notes.length>4000))throw new Error("Event notes are too long");
  if(!isExplicitInstant(input.startsAt) || !isExplicitInstant(input.endsAt) || !validTimeZone(input.timeZone))throw new Error("Invalid event time or time zone");
  const startsAt=new Date(input.startsAt),endsAt=new Date(input.endsAt);
  if(endsAt.getTime()<=startsAt.getTime() || endsAt.getTime()-startsAt.getTime()>31*86_400_000)throw new Error("Event must last between zero and 31 days");
  return {title:input.title.trim(),notes:(input.notes as string|undefined)||"",startsAt,endsAt,timeZone:input.timeZone};
}

export function eventRange(start:string|null,end:string|null){
  if(!isExplicitInstant(start)||!isExplicitInstant(end))throw new Error("Invalid event range");
  const from=new Date(start),to=new Date(end);
  if(to.getTime()<=from.getTime() || to.getTime()-from.getTime()>120*86_400_000)throw new Error("Invalid event range");
  return {from,to};
}
