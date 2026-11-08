/* Data helpers shared by the renderer and contract tests; no fixture fallback. */
(function(root){
  function groups(items){const result=[],seen=new Set();function visit(list){for(const item of list||[]){if(!item?.id||seen.has(item.id))continue;seen.add(item.id);result.push({...item,members:Array.isArray(item.members)?item.members:[]});visit(item.children);}}visit(items);return result;}
  function students(courses,allGroups){const people=new Map();for(const group of allGroups)for(const p of group.members||[])if(p.userId)people.set(p.userId,{id:p.userId,name:p.userName||p.username||p.userId});for(const course of courses)if(course.canTeach===true)for(const p of course.students||[])if(p.studentId)people.set(p.studentId,{id:p.studentId,name:p.studentName||p.studentId});return [...people.values()];}
  function lessons(courses){return courses.flatMap(course=>(course.sessions||[]).map(lesson=>({...lesson,courseId:course.id,courseName:course.name}))).filter(lesson=>lesson.id&&lesson.startTime).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime));}
  function lessonStatus(lesson){return lesson.endedAt?'finished':lesson.status||'scheduled';}
  function isFinished(lesson){return ['finished','cancelled'].includes(lessonStatus(lesson));}
  function nextLessons(courses,now=Date.now()){return lessons(courses).filter(lesson=>!isFinished(lesson)&&Date.parse(lesson.endTime)>now).slice(0,8);}
  function cover(id){return ['ocean','canyon','forest'][[...String(id)].reduce((n,c)=>n+c.charCodeAt(0),0)%3];}
  const model={groups,students,lessons,lessonStatus,isFinished,nextLessons,cover};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;else root.ClassroomHomeModel=model;
})(typeof window==='undefined'?{}:window);
