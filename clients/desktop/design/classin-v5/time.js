/* IANA zones and UTC instants. Shared by the local preview and Node checks. */
(function(root){
  'use strict';
  const formatters=new Map();
  function parts(instant,zone){
    if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
    const p=Object.fromEntries(formatters.get(zone).formatToParts(new Date(instant)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,year:+p.year,month:+p.month,day:+p.day,hour:+p.hour,minute:+p.minute,second:+p.second};
  }
  function wallCandidates(date,time,zone){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return [];
    const wall=Date.parse(`${date}T${time}:00Z`);if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==`${date}T${time}`)return [];
    const offsets=new Set();
    for(let h=-36;h<=36;h+=6){const instant=wall+h*3600000,p=parts(instant,zone);offsets.add(Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-instant);}
    return [...offsets].map(offset=>wall-offset).filter(instant=>{const p=parts(instant,zone);return p.date===date&&p.time===time;}).sort((a,b)=>a-b).map(n=>new Date(n).toISOString());
  }
  function fromWall(date,time,zone,choice='reject'){
    const candidates=wallCandidates(date,time,zone);if(!candidates.length)throw new Error('NONEXISTENT_TIME');if(candidates.length>1&&choice==='reject')throw new Error('AMBIGUOUS_TIME');return candidates[choice==='later'?candidates.length-1:0];
  }
  function project(lesson,zone){const start=parts(lesson.startsAt,zone),end=parts(lesson.endsAt,zone);return {...lesson,date:start.date,start:start.time,end:end.time,endDate:end.date};}
  function segments(lesson,zone){const p=project(lesson,zone),result=[];let date=p.date;for(let i=0;date<=p.endDate&&i<8;i++){const start=date===p.date?p.start:'00:00',end=date===p.endDate?p.end:'24:00';if(start!==end)result.push({...p,date,start,end,endDate:date});const d=new Date(`${date}T12:00Z`);d.setUTCDate(d.getUTCDate()+1);date=d.toISOString().slice(0,10);}return result;}
  function offsetLabel(instant,zone){return new Intl.DateTimeFormat('en',{timeZone:zone,timeZoneName:'shortOffset'}).formatToParts(new Date(instant)).find(p=>p.type==='timeZoneName').value.replace('GMT','UTC');}
  const api={parts,wallCandidates,fromWall,project,segments,offsetLabel};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ClassroomTime=api;
})(typeof globalThis!=='undefined'?globalThis:this);
