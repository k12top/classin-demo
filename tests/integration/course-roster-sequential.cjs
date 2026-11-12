/* eslint-disable @typescript-eslint/no-require-imports -- isolated local DB integration */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),url=new URL(process.env.DATABASE_URL||'http://invalid');if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||url.pathname!=='/classin_unified_dev')throw Error('Requires isolated local workspace database');
let dir,api,courseId,groupIds=[];
(async()=>{dir=await fs.mkdtemp(path.join(root,'node_modules/.roster-sequential-'));
 await esbuild.build({stdin:{contents:`export {prisma} from '@/lib/db';export {getEffectiveSessionRosters,getEffectiveSessionRostersSequential} from '@/lib/course-session-roster';`,resolveDir:root},outfile:path.join(dir,'api.cjs'),bundle:true,format:'cjs',platform:'node',packages:'external',tsconfig:path.join(root,'tsconfig.json')});api=require(path.join(dir,'api.cjs'));const db=api.prisma;
 const course=await db.course.create({data:{name:'Roster comparison',ownerId:'owner',ownerName:'Owner',teacherId:'owner',teacherName:'Owner'}});courseId=course.id;
 await db.courseTeacher.create({data:{courseId,teacherId:'teacher',teacherName:'Teacher'}});await db.courseStudent.createMany({data:['a','b','observer'].map(studentId=>({courseId,studentId,studentName:studentId}))});
 const group=await db.studentGroup.create({data:{name:'Roster group',createdBy:'owner'}}),excluded=await db.studentGroup.create({data:{name:'Excluded group',createdBy:'owner'}});groupIds.push(group.id,excluded.id);await db.groupMember.createMany({data:[...['a','c'].map(userId=>({groupId:group.id,userId,userName:userId})),...['c','e'].map(userId=>({groupId:excluded.id,userId,userName:userId}))]});await db.courseGroupLink.create({data:{courseId,groupId:group.id}});
 const start=new Date(Date.now()+86400000),make=async(position,mode)=>db.courseSession.create({data:{courseId,title:'Lesson '+position,position,teacherMode:mode,studentMode:mode,roomUuid:crypto.randomUUID(),roomType:4,status:'scheduled',startTime:start,endTime:new Date(+start+3600000),createdBy:'owner'}});
 const first=await make(1,'inherit'),second=await make(2,'custom');
 await db.courseSessionTeacher.createMany({data:[{courseId,sessionId:first.id,teacherId:'observer',role:'observer'},{courseId,sessionId:second.id,teacherId:'assistant',role:'assistant'}]});
 await db.courseSessionStudent.createMany({data:[{courseId,sessionId:first.id,studentId:'b',action:'exclude'},{courseId,sessionId:second.id,studentId:'d',action:'include'}]});
 await db.courseSessionGroupLink.create({data:{courseId,sessionId:second.id,groupId:group.id,action:'include'}});await db.courseSessionGroupLink.create({data:{courseId,sessionId:second.id,groupId:excluded.id,action:'exclude'}});
 const ids=[first.id,second.id],normal=await api.getEffectiveSessionRosters(ids),serial=await db.$transaction(tx=>api.getEffectiveSessionRostersSequential(ids,tx));
 const sort=items=>items.sort((a,b)=>a.sessionId.localeCompare(b.sessionId));assert.deepEqual(sort(serial),sort(normal));
 assert.deepEqual(new Set(serial.find(x=>x.sessionId===first.id).students.map(x=>x.userId)),new Set(['a','c']));assert.deepEqual(new Set(serial.find(x=>x.sessionId===second.id).students.map(x=>x.userId)),new Set(['a','d']));
 console.log('PASS sequential roster matches existing rules for inherited/custom members, groups and observers');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(api){if(courseId)await api.prisma.course.delete({where:{id:courseId}});if(groupIds.length)await api.prisma.studentGroup.deleteMany({where:{id:{in:groupIds}}});await api.prisma.$disconnect();}if(dir)await fs.rm(dir,{recursive:true,force:true});});
