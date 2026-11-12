import test from "node:test";
import assert from "node:assert/strict";
import {filterWorkspaceStudents,courseInitials,workspacePage,workspaceStudentSelection,teachingCourse,schedulableWorkspaceCourses,workspaceStudents,upcomingLessons,unstartedLessons,recentLessons,refreshedWorkspaceLesson,workspaceLessons,workspaceNextLessonTime,type WorkspaceCourse} from "../src/lib/workspace-model";
import {workspaceWeek,workspaceMonth,workspaceDaySegment,workspaceDaySegments,workspaceIntervalsByDay,workspaceEventColumns,workspaceConflictRanges,workspaceCalendarTimeRange,workspaceCalendarInitialScroll} from "../src/lib/workspace-calendar";

test("next lesson header identifies the local date outside today",()=>{
 const now=Date.parse("2026-12-31T23:00:00Z"),start="2027-01-01T00:30:00Z";
 assert.equal(workspaceNextLessonTime(start,now,"en-GB","UTC"),"1 Jan 2027, 00:30");
 assert.equal(workspaceNextLessonTime(start,now,"en-GB","America/New_York"),"19:30");
});

test("calendar starts near the first event, with a stable empty-day fallback", () => {
 assert.equal(workspaceCalendarInitialScroll([20*60+30, 19*60]),18*52);
 assert.equal(workspaceCalendarInitialScroll([20]),0);
 assert.equal(workspaceCalendarInitialScroll([NaN,1440,-1]),8*52);
});
import {refreshedSelectedLesson} from "../src/lib/course-schedule";
const course:WorkspaceCourse={id:"c",name:"Course",teacherName:"Teacher",teacherId:"org/teacher",status:"scheduled",startTime:null,endTime:null,roomType:4};
test("quick scheduling only offers manageable classes with room for a lesson",()=>{
 const courses=[{...course,id:"series",canTeach:true,courseKind:"series" as const},{...course,id:"limited",canTeach:false,lessonTeaching:true},{...course,id:"full",canTeach:true,courseKind:"standalone" as const,sessionCount:1},{...course,id:"empty",canTeach:true,courseKind:"standalone" as const,sessionCount:0},{...course,id:"cancelled",canTeach:true,status:"cancelled"}];
 assert.deepEqual(schedulableWorkspaceCourses(courses,"org/teacher").map(item=>item.id),["series","empty"]);
});
test("an open lesson follows the authorized list and closes when it disappears",()=>{
 const previous={id:"lesson",title:"Old"},updated={id:"lesson",title:"Updated"};
 assert.deepEqual(refreshedSelectedLesson(previous,[updated]),updated);
 assert.equal(refreshedSelectedLesson(previous,[{id:"other",title:"Other"}]),null);
 assert.equal(refreshedSelectedLesson(null,[updated]),null);
});
test("workspace lesson details follow the same authorized session across refresh",()=>{
 const lessons={...course,sessions:[{id:"one",status:"scheduled",startTime:"2030-01-01T10:00Z",endTime:"2030-01-01T11:00Z"},{id:"two",status:"scheduled",startTime:"2030-01-02T10:00Z",endTime:"2030-01-02T11:00Z"}]};
 const selected=workspaceLessons([lessons])[0];
 const changed={...lessons,sessions:[{...lessons.sessions[0],status:"cancelled"},lessons.sessions[1]]};
 assert.equal(refreshedWorkspaceLesson(selected,[changed])?.status,"cancelled");
 assert.equal(refreshedWorkspaceLesson(selected,[{...lessons,sessions:[lessons.sessions[1]]}]),null);
 assert.equal(refreshedWorkspaceLesson(null,[lessons]),null);
});
test("overlapping lessons and personal events remain separately visible",()=>{
 const columns=workspaceEventColumns([{key:"lesson",start:540,end:600},{key:"event",start:570,end:630},{key:"later",start:660,end:720},{key:"brief",start:720,end:725},{key:"next",start:730,end:760}]);
 assert.deepEqual(columns.get("lesson"),{column:0,columns:2});assert.deepEqual(columns.get("event"),{column:1,columns:2});
 assert.equal(columns.get("later")?.columns,1);assert.equal(columns.get("brief")?.columns,2);assert.equal(columns.get("next")?.columns,2);
});
test("explicit course teaching permissions override account type and legacy owner fields",()=>{
  assert.equal(teachingCourse({...course,canTeach:false},"org/teacher"),false);
  assert.equal(teachingCourse({...course,joinedAs:"student"},"org/teacher"),false);
  assert.equal(teachingCourse({...course,canTeach:true},"org/other"),true);
  assert.equal(teachingCourse(course,"teacher"),true);
});
test("student directory only contains authorized teaching-course and owned-group members",()=>{
 const courses=[{...course,canTeach:false,students:[{studentId:"private",studentName:"Private"}]},{...course,id:"own",canTeach:true,students:[{studentId:"org/s",studentName:"Student"}]}];
 const people=workspaceStudents(courses,[{id:"g",name:"Group",members:[{userId:"s",userName:"Student"}]}],"teacher");
 assert.equal(people.length,1);assert.deepEqual(people[0].courses,["own"]);assert.deepEqual(people[0].groups,["g"]);
});
test("student directory includes classes linked through an owned nested group",()=>{
 const groups=[{id:"parent",name:"Parent",members:[],children:[{id:"g",name:"Group",members:[{userId:"student",userName:"Student"}]}]}];
 const courses=[{...course,id:"own",canTeach:true,groupLinks:[{groupId:"g"}]},{...course,id:"foreign",canTeach:false,groupLinks:[{groupId:"g"}]}];
 const people=workspaceStudents(courses,groups,"teacher");assert.deepEqual(people[0].courses,["own"]);assert.deepEqual(people[0].groups,["g"]);
});
test("ended lessons leave upcoming and appear in recent even when their scheduled end is future",()=>{
 const courses=[{...course,sessions:[{id:"a",status:"live",startTime:"2030-01-01T10:00Z",endTime:"2030-01-01T11:00Z",endedAt:"2030-01-01T10:10Z",_count:{recordings:1}},{id:"b",status:"scheduled",startTime:"2030-01-02T10:00Z",endTime:"2030-01-02T11:00Z"}]}];
 assert.deepEqual(upcomingLessons(courses,Date.parse("2030-01-01T10:30Z")).map(s=>s.sessionId),["b"]);assert.equal(recentLessons(courses)[0].sessionId,"a");
});
test("recent replays exclude lessons without a recording and retain legacy single-course replays",()=>{
 const lessons={...course,sessions:[{id:"no-recording",status:"finished",startTime:"2030-01-03T10:00Z",endTime:"2030-01-03T11:00Z"},{id:"recording",status:"finished",startTime:"2030-01-02T10:00Z",endTime:"2030-01-02T11:00Z",_count:{recordings:1}}]};
 const legacy={...course,id:"legacy",status:"finished",hasPlayback:true,startTime:"2030-01-01T10:00Z"};
 assert.deepEqual(recentLessons([lessons,legacy]).map(item=>item.sessionId||item.id),["recording","legacy"]);
});
test("live and after-class lessons remain available after the scheduled end until actually finished",()=>{
 const lessons={...course,sessions:[
  {id:"live",status:"live",startTime:"2030-01-01T09:00Z",endTime:"2030-01-01T10:00Z"},
  {id:"after",status:"afterClass",startTime:"2030-01-01T09:15Z",endTime:"2030-01-01T10:15Z"},
  {id:"ended",status:"live",startTime:"2030-01-01T09:30Z",endTime:"2030-01-01T10:30Z",endedAt:"2030-01-01T10:05Z"},
  {id:"cancelled",status:"cancelled",startTime:"2030-01-01T09:45Z",endTime:"2030-01-01T10:45Z"},
  {id:"future",status:"scheduled",startTime:"2030-01-01T12:00Z",endTime:"2030-01-01T13:00Z"},
 ]};
 assert.deepEqual(upcomingLessons([lessons],Date.parse("2030-01-01T11:00Z")).map(item=>item.sessionId),["live","after","future"]);
});
test("unstarted view shows real scheduled lessons, including overdue ones, but not live or cancelled lessons",()=>{
 const courses=[{...course,sessions:[
  {id:"overdue",status:"scheduled",startTime:"2020-01-01T10:00Z",endTime:"2020-01-01T11:00Z"},
  {id:"future",status:"scheduled",startTime:"2030-01-01T10:00Z",endTime:"2030-01-01T11:00Z"},
  {id:"live",status:"live",startTime:"2030-01-01T10:00Z",endTime:"2030-01-01T11:00Z"},
  {id:"cancelled",status:"cancelled",startTime:"2030-01-01T10:00Z",endTime:"2030-01-01T11:00Z"},
  {id:"ended",status:"scheduled",startTime:"2030-01-01T10:00Z",endTime:"2030-01-01T11:00Z",endedAt:"2029-12-31T10:00Z"},
 ]},{...course,id:"legacy",startTime:"2030-01-01T10:00Z"}];
 assert.deepEqual(unstartedLessons(courses).map(lesson=>lesson.sessionId),["overdue","future"]);
});
test("week and month navigation keep calendar dates through DST boundaries",()=>{
 assert.deepEqual(workspaceWeek("2026-11-01"),["2026-10-26","2026-10-27","2026-10-28","2026-10-29","2026-10-30","2026-10-31","2026-11-01"]);
 assert.equal(workspaceMonth("2026-11-08").length,42);assert.equal(workspacePage("schedule"),"calendar");assert.equal(workspacePage("javascript:invalid"),"home");
});
test("cross-midnight classes split in the chosen display zone and preserve their UTC instants",()=>{
 const start="2026-11-10T22:30:00Z",end="2026-11-11T01:00:00Z";
 assert.deepEqual(workspaceDaySegment(start,end,"2026-11-10","UTC"),{start:1350,end:1440,continuesBefore:false,continuesAfter:true});
 assert.deepEqual(workspaceDaySegment(start,end,"2026-11-11","UTC"),{start:0,end:60,continuesBefore:true,continuesAfter:false});
 assert.deepEqual(workspaceDaySegment(start,end,"2026-11-11","Asia/Shanghai"),{start:390,end:540,continuesBefore:false,continuesAfter:false});
 assert.equal(workspaceDaySegment(start,end,"2026-11-12","Asia/Shanghai"),null);
});

test("calendar day index matches interval visibility across midnight and DST",()=>{
 const days=["2026-10-31","2026-11-01","2026-11-02","2026-11-03"];
 const items=[
  {id:"dst",start:"2026-11-01T05:50:00Z",end:"2026-11-01T06:10:00Z"},
  {id:"overnight",start:"2026-11-02T03:30:00Z",end:"2026-11-02T05:00:00Z"},
  {id:"open",start:"2026-11-03T04:30:00Z",end:null},
  {id:"invalid",start:"bad",end:null},
 ];
 for(const zone of ["UTC","America/New_York","Asia/Shanghai"]){
  const index=workspaceIntervalsByDay(items,days,zone,item=>item);
  for(const day of days)assert.deepEqual(index.get(day)?.map(item=>item.id),items.filter(item=>workspaceDaySegment(item.start,item.end,day,zone)).map(item=>item.id));
 }
});

test("calendar labels identify both offsets when clocks change during a lesson",()=>{
 const start="2026-11-01T05:50:00Z",end="2026-11-01T06:10:00Z";
 assert.equal(workspaceCalendarTimeRange(start,end,"en-US","America/New_York"),"01:50 GMT-4–01:10 GMT-5");
 assert.equal(workspaceCalendarTimeRange(start,end,"en-GB","UTC"),"05:50–06:10");
 assert.equal(workspaceCalendarTimeRange(start,null,"en-GB","UTC"),"05:50");
 assert.match(workspaceCalendarTimeRange("2026-03-08T06:50:00Z","2026-03-08T07:10:00Z","en-US","America/New_York"),/GMT-5.*GMT-4/);
});

test("calendar labels show local dates for lessons crossing midnight",()=>{
 const start="2026-11-10T22:30:00Z",end="2026-11-11T01:00:00Z";
 assert.equal(workspaceCalendarTimeRange(start,end,"en-GB","UTC"),"10 Nov 22:30–11 Nov 01:00");
 assert.equal(workspaceCalendarTimeRange(start,end,"en-GB","America/New_York"),"17:30–20:00");
 const yearBoundary=workspaceCalendarTimeRange("2026-12-31T23:30:00Z","2027-01-01T00:30:00Z","en-GB","UTC");
 assert.match(yearBoundary,/2026.*2027/);
});

test("timeline splits offset transitions into the actual wall-clock portions",()=>{
 const segments=(start:string,end:string,day:string,zone:string)=>workspaceDaySegments(start,end,day,zone).map(({start,end,offset})=>({start,end,offset}));
 assert.deepEqual(segments("2026-11-01T05:50:00Z","2026-11-01T06:10:00Z","2026-11-01","America/New_York"),[
  {start:110,end:120,offset:"GMT-4"},{start:60,end:70,offset:"GMT-5"},
 ]);
 const overlap=workspaceDaySegments("2026-11-01T05:10:00Z","2026-11-01T06:50:00Z","2026-11-01","America/New_York");
 const columns=workspaceEventColumns(overlap.map((part,index)=>({key:String(index),...part})));
 assert.equal(columns.get("0")?.columns,2);
 assert.notEqual(columns.get("0")?.column,columns.get("1")?.column);
 assert.deepEqual(segments("2026-03-08T06:50:00Z","2026-03-08T07:10:00Z","2026-03-08","America/New_York"),[
  {start:110,end:120,offset:"GMT-5"},{start:180,end:190,offset:"GMT-4"},
 ]);
 assert.deepEqual(segments("2026-04-04T14:50:00Z","2026-04-04T15:10:00Z","2026-04-05","Australia/Lord_Howe"),[
  {start:110,end:120,offset:"GMT+11"},{start:90,end:100,offset:"GMT+10:30"},
 ]);
 assert.deepEqual(workspaceDaySegments("2026-11-10T22:30:00Z","2026-11-11T00:00:00Z","2026-11-10","UTC").map(({start,end})=>({start,end})),[{start:1350,end:1440}]);
 assert.deepEqual(workspaceDaySegments("2026-11-10T22:30:00Z","2026-11-11T01:00:00Z","2026-11-11","UTC").map(({start,end})=>({start,end})),[{start:0,end:60}]);
 assert.deepEqual(segments("2026-11-10T22:30:00Z","2026-11-11T01:00:00Z","2026-11-12","UTC"),[]);
});

test("course badges preserve the approved compact programming labels",()=>{assert.equal(courseInitials("Python 算法基础班"),"PY");assert.equal(courseInitials("C++ 入门班"),"C++");assert.equal(courseInitials("数学基础"),"数学");});

test("explicit chat target selects only its own class",async()=>{
 const {workspaceChatCourse}=await import("../src/lib/workspace-model");
 const courses=[{id:"first",name:"First"},{id:"second",name:"Second"}];
 assert.equal(workspaceChatCourse(courses,"second")?.id,"second");
 assert.equal(workspaceChatCourse(courses,"unavailable"),undefined);
 assert.equal(workspaceChatCourse(courses,"")?.id,"first");
});
test("explicit group target never falls back to a different group",async()=>{
 const {workspaceSelectedGroup}=await import("../src/lib/workspace-model");
 const groups=[{id:"first"},{id:"second"}];
 assert.equal(workspaceSelectedGroup(groups,"second")?.id,"second");
 assert.equal(workspaceSelectedGroup(groups,"unavailable"),undefined);
 assert.equal(workspaceSelectedGroup(groups,"")?.id,"first");
});

test("student detail follows the filtered result without replacing an unavailable direct target",()=>{
 const alice={id:"alice"},bob={id:"bob"};
 assert.equal(workspaceStudentSelection([alice,bob],"alice", ""),alice);
 assert.equal(workspaceStudentSelection([bob],"alice", "bob"),bob);
 assert.equal(workspaceStudentSelection([alice,bob],"alice", ""),alice);
 assert.equal(workspaceStudentSelection([bob],"missing", ""),undefined);
 assert.equal(workspaceStudentSelection([],"alice", "bob"),undefined);
});


test("calendar marks only shared time, including nested and adjacent overlaps",()=>{
 assert.deepEqual(workspaceConflictRanges([{start:540,end:600},{start:570,end:630},{start:590,end:610},{start:700,end:720},{start:720,end:740}]),[{start:570,end:610}]);
 assert.deepEqual(workspaceConflictRanges([{start:540,end:570},{start:570,end:600}]),[]);
 assert.deepEqual(workspaceConflictRanges([{start:0,end:60},{start:0,end:60}]),[{start:0,end:60}]);
 // Repeated wall-clock labels can be an hour apart in real time.
 const early=workspaceDaySegments("2026-11-01T05:10:00Z","2026-11-01T05:40:00Z","2026-11-01","America/New_York");
 const late=workspaceDaySegments("2026-11-01T06:10:00Z","2026-11-01T06:40:00Z","2026-11-01","America/New_York");
 assert.deepEqual(workspaceConflictRanges([...early,...late]),[]);
 const simultaneous=workspaceDaySegments("2026-11-01T05:20:00Z","2026-11-01T05:30:00Z","2026-11-01","America/New_York");
 assert.deepEqual(workspaceConflictRanges([...early,...late,...simultaneous]),[{start:80,end:90}]);
});


test("student directory searches nested group names and paths without exposing unrelated people",()=>{
 const groups=[{id:"parent",name:"算法",members:[],children:[{id:"child",name:"进阶组",members:[],children:[]}]}];
 const students=[{id:"one",name:"Alice",groups:["child"]},{id:"two",name:"Bob",groups:[]}];
 assert.deepEqual(filterWorkspaceStudents(students,groups,"进阶").map(student=>student.id),["one"]);
 assert.deepEqual(filterWorkspaceStudents(students,groups,"算法").map(student=>student.id),["one"]);
 assert.deepEqual(filterWorkspaceStudents(students,groups,"TWO").map(student=>student.id),["two"]);
 assert.deepEqual(filterWorkspaceStudents(students,[],"进阶"),[]);
});
