import {zonedDateKey,zonedInputValue} from "./time-zone";
export function shiftWorkspaceDay(day:string,amount:number){const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10);}
export function workspaceWeek(day:string){const weekDay=(new Date(`${day}T12:00:00Z`).getUTCDay()+6)%7;const start=shiftWorkspaceDay(day,-weekDay);return Array.from({length:7},(_,index)=>shiftWorkspaceDay(start,index));}
export function workspaceMonth(day:string){const month=day.slice(0,7),first=`${month}-01`,start=workspaceWeek(first)[0];return Array.from({length:42},(_,index)=>shiftWorkspaceDay(start,index));}
/** Place the first visible item below the top edge, with a predictable empty-day default. */
export function workspaceCalendarInitialScroll(starts:readonly number[],hourHeight=52){
 const valid=starts.filter(value=>Number.isFinite(value)&&value>=0&&value<1440);
 const minute=valid.length?Math.max(0,Math.min(...valid)-60):8*60;
 return minute/60*hourHeight;
}
/** Disambiguate both endpoints when a lesson crosses a time-zone offset change. */
export function workspaceCalendarTimeRange(start:string,end:string|null,locale:string,zone:string):string{
 const clock=new Intl.DateTimeFormat(locale,{timeZone:zone,hour:"2-digit",minute:"2-digit",hour12:false});
 const from=new Date(start);
 if(!end)return clock.format(from);
 const to=new Date(end);
 const offset=new Intl.DateTimeFormat("en-US",{timeZone:zone,timeZoneName:"shortOffset"});
 const zoneAt=(value:Date)=>offset.formatToParts(value).find(part=>part.type==="timeZoneName")?.value||"";
 const fromZone=zoneAt(from),toZone=zoneAt(to);
 const fromDay=zonedDateKey(from,zone),toDay=zonedDateKey(to,zone);
 const date=fromDay!==toDay?new Intl.DateTimeFormat(locale,{timeZone:zone,month:"short",day:"numeric",...(fromDay.slice(0,4)!==toDay.slice(0,4)?{year:"numeric" as const}:{})}):null;
 const label=(value:Date,zoneLabel:string)=>`${date?`${date.format(value)} `:""}${clock.format(value)}${fromZone!==toZone?` ${zoneLabel}`:""}`;
 return `${label(from,fromZone)}–${label(to,toZone)}`;
}
/** Index intervals once for the days currently displayed in the calendar. */
export function workspaceIntervalsByDay<T>(items:readonly T[],days:readonly string[],zone:string,interval:(item:T)=>{start:string;end:string|null}):Map<string,T[]>{
 const result=new Map(days.map(day=>[day,[] as T[]]));
 for(const item of items){
  const {start,end}=interval(item),from=Date.parse(start),to=end?Date.parse(end):from+3_600_000;
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)continue;
  const first=zonedDateKey(new Date(from),zone),last=zonedDateKey(new Date(to-1),zone);
  for(const [day,entries] of result)if(day>=first&&day<=last)entries.push(item);
 }
 return result;
}
/** Clip an actual UTC interval to a displayed local day; never move the lesson itself. */
export function workspaceDaySegment(start:string,end:string|null,day:string,zone:string){
  const startInstant=Date.parse(start),endInstant=end?Date.parse(end):startInstant+3_600_000;
  if(!Number.isFinite(startInstant)||!Number.isFinite(endInstant)||endInstant<=startInstant)return null;
  const startDay=zonedDateKey(new Date(startInstant),zone),lastDay=zonedDateKey(new Date(endInstant-1),zone);
  if(day<startDay||day>lastDay)return null;
  const minute=(value:number)=>{const wall=zonedInputValue(new Date(value),zone).slice(11);return Number(wall.slice(0,2))*60+Number(wall.slice(3,5));};
  const from=day===startDay?minute(startInstant):0,to=day===zonedDateKey(new Date(endInstant),zone)?minute(endInstant):1440;
  // The autumn repeated hour can have a later instant with an earlier wall label.
  return {start:from,end:Math.max(from+15,to),continuesBefore:day>startDay,continuesAfter:day<lastDay};
}

/** Split a local-day interval at an offset change so repeated wall times are not lost. */
export function workspaceDaySegments(start:string,end:string|null,day:string,zone:string){
 const begin=Date.parse(start),finish=end?Date.parse(end):begin+3_600_000;
 if(!Number.isFinite(begin)||!Number.isFinite(finish)||finish<=begin)return [];
 const dateAt=(instant:number)=>zonedDateKey(new Date(instant),zone);
 if(day<dateAt(begin)||day>dateAt(finish-1))return [];
 // Find local midnight only when the event actually spans this day boundary.
 const firstAtOrAfter=(target:string)=>{let low=begin,high=finish;while(low<high){const mid=Math.floor((low+high)/2);if(dateAt(mid)<target)low=mid+1;else high=mid;}return low;};
 const dayBegin=day===dateAt(begin)?begin:firstAtOrAfter(day);
 const nextDay=shiftWorkspaceDay(day,1);
 const dayEnd=dateAt(finish-1)===day?finish:firstAtOrAfter(nextDay);
 const formatter=new Intl.DateTimeFormat("en-US",{timeZone:zone,timeZoneName:"shortOffset"});
 const offsetAt=(instant:number)=>formatter.formatToParts(new Date(instant)).find(part=>part.type==="timeZoneName")?.value||"";
 const wallMinute=(instant:number)=>{const value=zonedInputValue(new Date(instant),zone);return Number(value.slice(11,13))*60+Number(value.slice(14,16));};
 const firstOffset=offsetAt(dayBegin),lastOffset=offsetAt(dayEnd-1);
 const ranges:{from:number;to:number;offset:string}[]=[];
 if(firstOffset===lastOffset)ranges.push({from:dayBegin,to:dayEnd,offset:firstOffset});
 else{
  let low=dayBegin,high=dayEnd-1;
  while(low<high){const mid=Math.floor((low+high)/2);if(offsetAt(mid)===firstOffset)low=mid+1;else high=mid;}
  ranges.push({from:dayBegin,to:low,offset:firstOffset},{from:low,to:dayEnd,offset:lastOffset});
 }
 return ranges.map((item,index)=>{
  const from=item.from===dayBegin&&dayBegin!==begin?0:wallMinute(item.from);
  const to=dateAt(item.to)!==day?1440:offsetAt(item.to)!==item.offset?wallMinute(item.to-1)+1:wallMinute(item.to);
  return {start:from,end:Math.max(from+1,to),offset:item.offset,split:ranges.length>1,index};
 });
}

/** Place connected overlapping intervals side by side, including the minimum rendered height. */
export function workspaceEventColumns(items:{key:string;start:number;end:number}[]){
  const sorted=[...items].sort((a,b)=>a.start-b.start||a.end-b.end||a.key.localeCompare(b.key));
  const result=new Map<string,{column:number;columns:number}>();
  let cluster:typeof sorted=[],clusterEnd=-1;
  const flush=()=>{
    const ends:number[]=[];const assigned:{key:string;column:number}[]=[];
    for(const item of cluster){let column=ends.findIndex(end=>end<=item.start);if(column<0)column=ends.length;ends[column]=Math.max(item.end,item.start+36);assigned.push({key:item.key,column});}
    for(const item of assigned)result.set(item.key,{column:item.column,columns:ends.length});
    cluster=[];clusterEnd=-1;
  };
  for(const item of sorted){if(cluster.length&&item.start>=clusterEnd)flush();cluster.push(item);clusterEnd=Math.max(clusterEnd,item.end,item.start+36);}
  flush();return result;
}

/** Stable, decorative class colors; lesson status remains available as text. */
export function workspaceCalendarCourseColor(courseId:string):"green"|"blue"|"amber"{
 let hash=0;
 for(const char of courseId)hash=(Math.imul(hash,31)+char.codePointAt(0)!)>>>0;
 return (["green","blue","amber"] as const)[hash%3];
}

/** Only claim an empty day after every visible source has a usable result. */
export function workspaceCalendarDataStatus(sources:readonly {visible:boolean;ready:boolean;failed:boolean}[]):"ready"|"loading"|"error"{
 const pending=sources.filter(source=>source.visible&&!source.ready);
 return !pending.length?"ready":pending.some(source=>source.failed)?"error":"loading";
}

/** Merge real intersections, keeping the two offsets of a repeated DST hour distinct. */
export function workspaceConflictRanges(items: readonly {start:number;end:number;offset?:string}[]) {
 const groups=new Map<string,{at:number;delta:number}[]>();
 for(const item of items){if(item.end<=item.start)continue;const key=item.offset||"";const edges=groups.get(key)||[];edges.push({at:item.start,delta:1},{at:item.end,delta:-1});groups.set(key,edges);}
 const intersections:{start:number;end:number}[]=[];
 for(const edges of groups.values()){
  edges.sort((a,b)=>a.at-b.at||a.delta-b.delta);let active=0,start:number|undefined;
  for(const edge of edges){const before=active;active+=edge.delta;if(before<2&&active>=2)start=edge.at;if(before>=2&&active<2&&start!==undefined){if(edge.at>start)intersections.push({start,end:edge.at});start=undefined;}}
 }
 intersections.sort((a,b)=>a.start-b.start||a.end-b.end);
 const merged:{start:number;end:number}[]=[];
 for(const range of intersections){const last=merged.at(-1);if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);else merged.push({...range});}
 return merged;
}
